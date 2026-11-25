# Verdant — Carbon-Aware Cloud Scheduling

A working research dashboard for configuring geographically distributed data centers, generating or importing workloads, and comparing a carbon-aware scheduler against round-robin and performance-first scheduling.

## Start locally

Node.js 20+ is required. The application has no runtime npm dependencies.

```powershell
cd "C:\Users\M K Vasudev\OneDrive\Desktop\CC\carbon-aware-cloud"
npm start
```

Open **http://127.0.0.1:3000**. The sample scenario runs automatically on a fresh browser. Use **Data centers** to add or edit infrastructure, **Workloads** to generate/import tasks, and **Scheduler** to adjust scoring weights. Click **Run experiment** after editing inputs. Old results retain their original configuration and show a configuration-changed label.

The hosted review dashboard is static and runs the same reference simulation in a browser worker. It does not contact AWS, run Java, or expose Prometheus. The local server adds the API, metrics endpoint, and optional Java execution replay.

## CloudSim Plus

Install a JDK 17+ and make `java` available on PATH. Then:

```powershell
npm run build:cloudsim
npm start
```

The build helper downloads Maven 3.9.11 into ignored `.tools/`, verifies its SHA-512 checksum, and builds CloudSim Plus 8.5.1 with the Java adapter. No system Maven install is required. Alternatively, run `mvn -f cloudsim/pom.xml package` using your own Maven.

When the JAR exists, every local API experiment replays the carbon-aware placement plan in CloudSim Plus. **Experiments** identifies the execution engine; the full JSON export contains actual replay start/finish times, completion counts, and deviations from the reference plan. Replay failures appear as `cloudsimError` and do not silently become successful Java runs.

**Scope:** the custom carbon-aware placement algorithm and environmental calculations currently run in the shared JavaScript reference model. CloudSim Plus independently replays CPU execution using regional hosts, VMs, space-shared cloudlets, and RAM utilization estimates. Replay data is separate from dashboard reference metrics. This version is not a native CloudSim broker implementation, nor a real AWS workload orchestrator.

## Inputs

CSV headers, examples, and units are included in `samples/`. Templates can also be downloaded from the dashboard.

| Dataset | Fields |
| --- | --- |
| Data centers | `id,name,region,country,hosts,cores,ram,mips,idleWatts,maxWatts,pue,carbon,renewable,price,latency,enabled` |
| Workloads | `id,arrival,length,cores,ram,deadline,maxLatency,origin` |
| Optional energy profiles | `centerId,time,carbon,renewable,price` |

- **Data center units:** RAM in GB **per host**; MIPS per core; power in W per host; carbon in gCO₂e/kWh; renewables in percent; price in USD/kWh; network latency in ms. PUE is facility energy / IT energy. Region and country are descriptive labels.
- **Workload units:** arrival in simulated seconds; length is **total** million instructions across all requested cores; RAM in GB; deadline in seconds **after arrival**; maximum latency in ms. Origin is a label and does not automatically determine latency.
- **Profiles:** piecewise-constant conditions beginning at `time` in simulated seconds. Base center values apply before the first profile row. Duplicate center/time observations are rejected. Upload replaces the existing profile dataset.
- Data center and workload CSV imports replace the corresponding current dataset. Importing different centers removes profiles for deleted center IDs. Input errors leave the previous configuration intact.
- Supported limits: 1–12 centers, 1–16 hosts per center, 1–64 cores per host, 1–1,000 workloads, 2,000 profile rows, and a 10–86,400 second observation horizon.

Sample grid values and AWS-style region labels are **illustrative assumptions**, not live measurements or AWS hardware specifications.

## Scheduling and calculations

1. Sort tasks by arrival then ID. Each task runs non-preemptively on one host.
2. Find each host’s earliest interval that has enough CPU and RAM. Enforce network-latency limits.
3. Prefer deadline-feasible candidates. If none can meet the deadline, either reject the task or choose from resource/latency-feasible candidates and record a possible SLA miss, depending on policy.
4. Carbon-aware placement ranks candidates using min–max normalized **predicted task emissions, cost, and response time**, multiplied by user weights. Round-robin cycles feasible regions; performance-first selects the earliest response.
5. Observe all strategies over the same finite horizon, with identical inputs and power assumptions.

```text
execution seconds = total MI / (MIPS per core × requested cores)
response seconds = waiting + execution + configured latency_ms / 1000
host power W = idle W + (max W − idle W) × occupied-core fraction
energy kWh = integral(host power W × PUE) / 3,600,000
emissions gCO₂e = integral(energy kWh × grid intensity gCO₂e/kWh)
electricity cost USD = integral(energy kWh × price USD/kWh)
```

All enabled hosts remain powered on throughout the horizon. Facility totals include unused-host idle electricity and PUE. Task estimates allocate a core-proportional share of maximum host power during execution; they **do not sum to facility totals**, which also contain unassigned idle energy.

Carbon intensity is supplied independently; renewable share is not applied as an extra emissions discount. Time-varying profiles are integrated at their observation boundaries. No forecast beyond the supplied trace is invented; the last observation stays in effect.

| Output | Definition |
| --- | --- |
| Carbon emissions | Total modeled operational emissions, gCO₂e |
| Energy consumption | Powered-on host and facility electricity, kWh |
| Renewable energy utilization | Estimated renewable kWh / total kWh |
| Renewable-rich task percentage | Completed tasks whose energy-weighted renewable share meets the configured threshold / completed tasks |
| Electricity cost | Modeled electricity only, USD |
| Response time / P95 | Completed-task turnaround including configured latency, seconds |
| CPU / RAM utilization | Reserved resource-seconds / available resource-seconds over the full horizon |
| Task completion | Completed / submitted; running, queued, and rejected reported separately |
| SLA compliance | Submitted tasks completed within deadline and latency requirements / all submitted tasks |
| Load distribution | Assigned task counts and time-weighted CPU usage per center |
| Throughput | Completed tasks / simulated observation seconds |

Tasks still executing or waiting at the horizon are not counted as completed. The response-time average excludes unfinished and rejected tasks; assess completion and SLA alongside it. Network energy, storage/I/O, VM startup, hardware failures, embodied carbon, task migration, and automatic deferral to future clean-energy periods are not modeled in reference metrics.

## Docker, Prometheus, and Grafana

With Docker Engine/Desktop running:

```sh
docker compose up --build -d
docker compose ps
```

| Service | Local URL |
| --- | --- |
| Application | http://127.0.0.1:3000 |
| Prometheus | http://127.0.0.1:9090 |
| Grafana | http://127.0.0.1:3001 |

Grafana local-demo login: `admin` / `verdant-local-demo`. Set `GRAFANA_ADMIN_PASSWORD` in an ignored `.env` before the first Grafana startup to choose another password. The **Research / Verdant** dashboard and Prometheus data source are provisioned automatically.

Run an experiment through the local application before expecting scheduling gauges in Grafana. `verdant_simulated_*` metrics describe the **latest experiment**; Prometheus timestamps are real scrape timestamps, not simulated task time. API counters and request duration describe actual service operation. With multiple clients, gauges show whichever experiment completed most recently; experiment-specific history remains in each browser and JSON exports.

Ports bind to loopback in Compose. The application is a single-user research prototype, with browser-local history rather than a multi-user database. Use the EC2 SSH tunnel described in `docs/EC2.md` for a remote demonstration.

## API

```text
GET  /api/health       service health and Java JAR availability
POST /api/experiments  JSON scenario → results for all three strategies + optional replay
GET  /metrics         Prometheus text exposition
```

Example from the project directory:

```powershell
$scenarioBody = Get-Content -Raw -LiteralPath samples/scenario.json
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/experiments -Method Post -ContentType application/json -Body $scenarioBody
```

The API accepts a 5 MB request and at most two concurrent experiments. Excess requests return 429 with `Retry-After`. Disable Java replay for reference-only API benchmarks with environment variable `CLOUDSIM_REPLAY=false`.

## Apache JMeter

Install Apache JMeter 5.6.3+ and run the supplied plan from the project root while the local API is running:

```sh
jmeter -n -t load-tests/verdant.jmx -Jusers=2 -Jloops=5 -Jhost=127.0.0.1 -Jport=3000 -Jscenario=samples/scenario.json -l results.jtl -e -o jmeter-report
```

Choose a new/empty report output directory for each run. The plan checks HTTP 200, uses JSON requests, ramps up clients, and adds think time. Increase users to study saturation and explicit 429 responses. The measured response time is **real API latency**, separate from simulated workload response time. No JMeter performance claims are provided without running and retaining its output.

## Verification

```sh
npm test
npm install
npm start
# In a second terminal, using installed Edge on Windows:
npm run test:browser
```

`npm test` checks analytical energy/carbon calculations, repeatability, CPU/RAM constraints, latency and deadline policies, finite horizons, energy profiles, CSV parsing, HTTP validation, metrics, and Java replay. The replay test is explicitly skipped if the JAR has not been built. Browser QA uses `playwright-core` and an existing browser; set `BROWSER_EXECUTABLE` for another installation. Screenshots are written to ignored `test-artifacts/`.

## Project layout

```text
dist/          Dashboard, browser worker, shared simulation engine
server.mjs     Local API, static hosting, Prometheus, Java process adapter
cloudsim/      Maven project and CloudSim Plus execution replay
monitoring/    Prometheus and provisioned Grafana dashboard
load-tests/    Apache JMeter test plan
samples/       Reproducible scenario and CSV input examples
tests/         Analytical, API, replay, and browser verification
docs/EC2.md    Remote EC2 demonstration instructions
```

Official implementation references: [CloudSim Plus 8.5.1](https://central.sonatype.com/artifact/org.cloudsimplus/cloudsimplus/8.5.1), [CloudSim Plus source](https://github.com/cloudsimplus/cloudsimplus/tree/v8.5.1), [Docker Compose](https://docs.docker.com/compose/install/), [JMeter CLI](https://jmeter.apache.org/usermanual/get-started). CloudSim Plus is GPLv3; review the upstream license when distributing its bundled JAR.
