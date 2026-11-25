package research.verdant;

import com.google.gson.*;
import org.cloudsimplus.core.CloudSimPlus;
import org.cloudsimplus.hosts.Host;
import org.cloudsimplus.hosts.HostSimple;
import org.cloudsimplus.resources.Pe;
import org.cloudsimplus.resources.PeSimple;
import org.cloudsimplus.datacenters.Datacenter;
import org.cloudsimplus.datacenters.DatacenterSimple;
import org.cloudsimplus.brokers.DatacenterBrokerSimple;
import org.cloudsimplus.cloudlets.Cloudlet;
import org.cloudsimplus.cloudlets.CloudletSimple;
import org.cloudsimplus.schedulers.cloudlet.CloudletSchedulerSpaceShared;
import org.cloudsimplus.vms.Vm;
import org.cloudsimplus.vms.VmSimple;
import org.cloudsimplus.utilizationmodels.UtilizationModelFull;
import org.cloudsimplus.utilizationmodels.UtilizationModelDynamic;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Replays an externally computed carbon-aware placement plan in CloudSim Plus.
 * The reference scheduler enforces RAM and latency; this replay checks CPU execution.
 * Results intentionally stay separate from reference energy and SLA metrics.
 */
public final class Replay {
  public static void main(String[] args) {
    try {
      JsonObject input = JsonParser.parseReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).getAsJsonObject();
      JsonObject scenario = input.getAsJsonObject("scenario");
      double horizon = scenario.getAsJsonObject("settings").get("duration").getAsDouble();
      CloudSimPlus simulation = new CloudSimPlus(0.0001);
      Map<String, Vm> vms = new HashMap<>();
      Map<String, DatacenterBrokerSimple> brokers = new HashMap<>();
      long vmId = 0;
      for (JsonElement element : scenario.getAsJsonArray("centers")) {
        JsonObject dc = element.getAsJsonObject();
        if (!dc.get("enabled").getAsBoolean()) continue;
        String id = dc.get("id").getAsString();
        int cores = dc.get("cores").getAsInt(), hostCount = dc.get("hosts").getAsInt();
        long ramMb = Math.round(dc.get("ram").getAsDouble() * 1024);
        double mips = dc.get("mips").getAsDouble();
        List<Host> hosts = new ArrayList<>();
        for (int h = 0; h < hostCount; h++) {
          List<Pe> pes = new ArrayList<>();
          for (int p = 0; p < cores; p++) pes.add(new PeSimple(mips));
          hosts.add(new HostSimple(ramMb, 100000, 1000000, pes));
        }
        Datacenter datacenter = new DatacenterSimple(simulation, hosts);
        datacenter.setSchedulingInterval(1);
        DatacenterBrokerSimple broker = new DatacenterBrokerSimple(simulation);
        broker.setDatacenterMapper((previous, vm) -> previous == Datacenter.NULL ? datacenter : Datacenter.NULL);
        broker.setVmDestructionDelay(horizon + 10);
        brokers.put(id, broker);
        List<Vm> localVms = new ArrayList<>();
        for (int h = 0; h < hostCount; h++) {
          Vm vm = new VmSimple(vmId++, mips, cores).setRam(ramMb).setBw(10000).setSize(10000)
            .setCloudletScheduler(new CloudletSchedulerSpaceShared());
          localVms.add(vm); vms.put(id + "-" + h, vm);
        }
        broker.submitVmList(localVms);
      }
      List<Cloudlet> submitted = new ArrayList<>();
      Map<Long, JsonObject> original = new HashMap<>();
      long cloudletId = 0;
      for (JsonElement element : input.getAsJsonArray("plan")) {
        JsonObject task = element.getAsJsonObject();
        if (task.get("status").getAsString().equals("rejected") || !task.has("start") || task.get("start").getAsDouble() >= horizon) continue;
        int cores = task.get("cores").getAsInt();
        long perCoreLength = Math.max(1, Math.round(task.get("length").getAsDouble() / cores));
        Cloudlet cloudlet = new CloudletSimple(cloudletId++, perCoreLength, cores)
          .setUtilizationModel(new UtilizationModelFull()).setFileSize(1).setOutputSize(1);
        Vm targetVm = vms.get(task.get("hostId").getAsString());
        cloudlet.setUtilizationModelRam(new UtilizationModelDynamic(task.get("ram").getAsDouble() * 1024 / targetVm.getRam().getCapacity()));
        cloudlet.setUtilizationModelBw(new UtilizationModelDynamic(0));
        cloudlet.setSubmissionDelay(task.get("start").getAsDouble());
        cloudlet.setVm(targetVm);
        brokers.get(task.get("centerId").getAsString()).submitCloudlet(cloudlet);
        submitted.add(cloudlet); original.put(cloudlet.getId(), task);
      }
      simulation.terminateAt(horizon);
      simulation.start();
      JsonArray executions = new JsonArray();
      int completed = 0; double totalDeviation = 0;
      for (Cloudlet cloudlet : submitted) {
        JsonObject task = original.get(cloudlet.getId());
        JsonObject row = new JsonObject();
        row.addProperty("id", task.get("id").getAsString());
        row.addProperty("status", cloudlet.getStatus().toString());
        row.addProperty("lengthPerCoreMI", cloudlet.getLength());
        row.addProperty("finishedLengthPerCoreMI", cloudlet.getFinishedLengthSoFar());
        row.addProperty("vmMipsPerCore", cloudlet.getVm().getMips());
        row.addProperty("plannedStart", task.get("start").getAsDouble());
        row.addProperty("actualStart", cloudlet.getStartTime());
        row.addProperty("plannedFinish", task.get("end").getAsDouble());
        if (cloudlet.isFinished()) {
          row.addProperty("actualFinish", cloudlet.getFinishTime());
          double deviation = Math.abs(cloudlet.getFinishTime() - task.get("end").getAsDouble());
          boolean withinHorizon = cloudlet.getFinishTime() <= horizon;
          row.addProperty("completedWithinHorizon", withinHorizon);
          if (withinHorizon) { completed++; totalDeviation += deviation; }
          row.addProperty("finishDeviationSeconds", deviation);
        }
        executions.add(row);
      }
      JsonObject result = new JsonObject();
      result.addProperty("engine", "CloudSim Plus 8.5.1"); result.addProperty("mode", "carbon-aware CPU execution replay");
      result.addProperty("submitted", submitted.size()); result.addProperty("completed", completed);
      result.addProperty("observationHorizonSeconds", horizon); result.addProperty("simulationClockSeconds", simulation.clock());
      result.addProperty("meanFinishDeviationSeconds", completed == 0 ? 0 : totalDeviation / completed);
      result.addProperty("note", "Completed counts only tasks finishing by the observation horizon. CloudSim's final event clock may overshoot that horizon. Replay includes event/VM setup delays and per-core MI rounding. RAM admission, latency, energy, and SLA metrics remain reference-model estimates.");
      result.add("tasks", executions);
      System.out.println(new Gson().toJson(result));
    } catch (Exception exception) {
      System.err.println(exception.getClass().getSimpleName() + ": " + exception.getMessage());
      System.exit(1);
    }
  }
}
