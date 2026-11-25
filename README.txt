VERDANT
CARBON-AWARE CLOUD SCHEDULING FOR SUSTAINABLE DATA CENTERS
A complete teaching guide to the actual project
==========================================================================

ABOUT THIS DOCUMENT

This guide explains the implementation present in this project, from the
problem being studied to the final dashboard, CSV files, and report graphs.
Read it in order if cloud computing and scheduling are new to you. File and
function references connect the explanations to the source without requiring
you to understand every line of code.

All paths in this guide are relative to carbon-aware-cloud/, the application
root containing package.json and server.mjs. The surrounding CC directory
also contains publishing/deployment artifacts; those are not application
entry points. The maintained application and canonical sample results
described here are inside carbon-aware-cloud/.

The most important scope distinction is this:

  JavaScript reference model = scheduling decisions and modeled metrics.
  CloudSim Plus replay       = a separate check of carbon-plan CPU timing.
  Docker/monitoring/EC2      = packaging, observation, and deployment support.

This is a working simulation and comparison application. It does not send
user workloads to real AWS regions or measure a physical data center's power.
Claims about the results must respect that boundary.

CONTENTS

  1. Understanding the problem and the solution
  2. Concepts, technologies, and why they are used
  3. What the user gives the application
  4. Complete end-to-end execution and architecture
  5. Scheduling algorithms and decision rules
  6. Energy accounting and the meaning of every metric
  7. One complete, verified example
  8. Understanding the dashboard and exported outputs
  9. What the saved experiment actually demonstrates
 10. Connecting the workflow to the source code
 11. Design decisions, alternatives, and limitations
 12. Project lifecycle and validation
 13. Current status and future improvements
 14. Evaluation questions with implementation-grounded answers
 15. Technical vocabulary and key takeaways
 16. Short execution reference


1. UNDERSTANDING THE PROBLEM AND THE SOLUTION
==========================================================================

1.1 Start with a simple situation

Imagine an organization has several places where a computing job can run.
One location is nearby, another has faster processors, another uses cleaner
electricity, and another has cheaper electricity. A job might be an analysis,
a batch calculation, or a portion of a larger application.

Choosing where to run that job affects more than speed. Computers consume
electricity. Producing that electricity can release greenhouse gases. The
same computing work can therefore have different estimated emissions at
different locations, even when the program itself does not change.

A scheduler is the decision maker that assigns jobs to computing resources.
Our project asks: can that decision consider environmental impact while
still respecting computing capacity, network latency, and deadlines?

1.2 What exactly is Verdant?

Verdant is an interactive research application for configuring geographically
distributed data centers, describing workloads, simulating alternative
scheduling strategies, and comparing their outcomes.

You supply a scenario. The application evaluates the same scenario three
times, using carbon-aware, round-robin, and performance-first scheduling.
It shows where jobs were assigned, when they could execute, how many finish
within the observation period, and the modeled energy, emissions, cost,
renewable share, utilization, response time, and service compliance.

You can inspect individual task decisions, export results, and use the
included Python program to generate report figures directly from exported
CSV data. An optional CloudSim Plus Java process independently replays the
carbon-aware placement plan to examine CPU execution timing.

1.3 Why the problem matters

Selecting only the fastest location can repeatedly favor a location with a
less clean electricity supply. Distributing work in a fixed rotation can
ignore both electricity conditions and differences in processing speed.
Always choosing the cleanest location can overload it or violate latency
and deadline requirements. These competing concerns make the scheduling
decision worth studying rather than reducing it to one fixed rule.

In a real deployment without environmental scheduling, placement decisions
can miss opportunities to reduce operational electricity emissions. The
project demonstrates this decision problem in a controlled model; it does
not claim that every real cloud scheduler ignores sustainability.

1.4 The fundamental solution

First eliminate placements that cannot satisfy a task's resource and
network limits. Prefer placements that can meet its deadline. Then compare
the remaining choices using a weighted combination of estimated carbon,
electricity cost, and response time. Reserve the selected host resources
so that later jobs see the load created by earlier decisions.

This is a constrained, greedy, multi-objective scheduling heuristic:
"constrained" means some choices are forbidden; "greedy" means one job is
decided at a time; "multi-objective" means several goals influence a choice.
It does not calculate a proven global optimum for all jobs together.

1.5 The expected final outcome

The outcome is an understandable comparison, not a promise that the carbon
strategy wins every metric. A useful result may show lower emissions with
longer response times or fewer completed jobs. The reader should be able to
explain that tradeoff using task decisions and measured model outputs.


2. CONCEPTS, TECHNOLOGIES, AND WHY THEY ARE USED
==========================================================================

2.1 Data centers, hosts, cores, and tasks

A data center is a modeled location containing hosts. A host is a server
with a fixed number of CPU cores and a fixed amount of RAM. A task requests
some of those cores and some RAM for its entire execution interval.

The distinction matters because capacity belongs to each host. A task
requiring more RAM than one host has cannot combine unused RAM from several
hosts. For example, a 40 GB task cannot run on a location whose individual
hosts each have 32 GB, even when that location has 64 GB in total.

The reference model constructs logical host records with booking calendars.
The Java replay represents each logical host with one VM using that host's
CPU and RAM capacity. This provides a simple connection between the two
models without modeling a general VM provisioning service.

2.2 Work size and processing speed

MI means million instructions. MIPS means million instructions per second.
A task's length is its TOTAL work in MI across all requested cores. A data
center's mips value is the processing speed of ONE core.

The model assumes ideal parallel execution:

  execution seconds = total MI / (MIPS per core * requested cores)

For example, 200,000 MI on two 1,000-MIPS cores takes 100 seconds. This
simplification makes the scheduling calculation transparent. It omits
parallelization overhead, memory bottlenecks, and CPU frequency changes.

2.3 CPU and RAM reservation

Resources cannot be allocated beyond a host's capacity at any instant.
Tasks can overlap when both their total reserved cores and their total
reserved RAM fit. RAM is an admission/reservation quantity here; it does
not directly increase the power calculation or slow CPU execution.

For example, two tasks each needing two cores and 4 GB can overlap on an
eight-core, 32 GB host. A new task asking for eight cores must wait until
enough currently reserved cores become free.

2.4 Waiting, response time, latency, and deadlines

Waiting is the time from task arrival until its planned CPU start.
Execution is the time spent doing the modeled CPU work.
Network latency is a configured data-center delay in milliseconds.
Response time is waiting plus execution plus one configured latency term.
A relative deadline is the maximum permitted response time after arrival.

These quantities are separate because a fast processor can still provide
a poor response when it is busy or far away. The code converts latency
from milliseconds to seconds before adding it. Latency does not occupy
CPU resources and does not postpone the modeled CPU start.

The origin field, such as Bengaluru, is descriptive. It does not calculate
distance or select a different latency. Every task sees the same configured
latency for a given data center; its maxLatency determines eligibility.

2.5 Carbon intensity, renewable share, and electricity price

Carbon intensity describes modeled emissions per unit of electricity:
grams of carbon-dioxide equivalent per kilowatt-hour, or gCO2e/kWh.
Renewable share is the percentage of supplied electricity classified as
renewable. Electricity price is USD per kWh.

These are scenario inputs, not live readings. They may be constant for a
location or changed by optional timestamped profile rows. Carbon intensity
already describes the electricity mix. Renewable share is reported
separately; emissions are not discounted by renewable share a second time.

For example, 0.01 kWh at 45 gCO2e/kWh produces 0.45 gCO2e in the model.
If the renewable share is 92%, renewable electricity attributed to that
consumption is 0.0092 kWh. The carbon result remains 0.45 gCO2e.

Renewable percentage is not an independent term in the scheduling score.
The score uses carbon, cost, and response. Renewable percentage influences
the reported renewable metrics and the renewable-rich task classification.

2.6 Power, energy, and facility overhead

Power in watts describes a rate of electricity use. Energy in kWh describes
electricity used over time. An idle host still consumes power. A busy host
uses additional power according to its fraction of reserved CPU cores.

Power Usage Effectiveness, or PUE, represents facility overhead:

  PUE = total facility electricity / IT equipment electricity

A PUE of 1.2 means this model multiplies IT energy by 1.2 to include cooling
and other facility overhead. For example, 100 W for one hour is 0.1 kWh of
IT energy and 0.12 kWh after a PUE multiplier of 1.2.

2.7 Deterministic simulation and synthetic workloads

A simulation computes how a described system would behave under stated
assumptions. Verdant's reference simulation calculates bookings and
integrates their consequences; it does not wait 900 real seconds for a
900-second experiment.

Synthetic workloads are generated task descriptions rather than collected
production traces. A seeded pseudo-random generator makes them repeatable.
Given identical inputs and settings, modeled numerical results repeat.
Experiment IDs and creation timestamps intentionally change between runs.

This supports controlled comparisons and debugging. It does not turn
synthetic input into representative production evidence automatically.

2.8 Why JavaScript, Node.js, and a Web Worker are used

The user interface uses HTML, CSS, and browser JavaScript modules. Node.js
serves the interface and provides an experiment API using built-in modules.
The core engine is ordinary JavaScript shared by browser and server.
There are no npm runtime dependencies in the current package.json.

A Web Worker is a separate browser execution context. When the Verdant API
is unavailable at startup, the frontend can ask a worker to run the same
reference engine without blocking the main interface thread. A worker run
does not have Java replay or server-side Prometheus observations.

These choices give the project a small runtime surface and keep numerical
logic consistent across execution paths. dist/ contains authored runtime
source in this project; it is not an expendable generated build directory.

2.9 Why CloudSim Plus and Gson are used

CloudSim Plus is a discrete-event cloud simulator. Instead of sleeping
through every second, it advances its simulated clock through events such
as VM creation, task submission, and task completion. The Java implementation
uses CloudSim Plus 8.5.1 and targets Java 17.

Gson serializes and parses the JSON exchanged between Node.js and Java.
The Maven build packages the Java code and its dependencies into an
executable JAR. It gives the project a separate CPU timing implementation
to compare with the reference plan.

The replay is deliberately narrower than the main application. CloudSim
does not choose carbon-aware placements here, calculate the displayed
emissions, or independently validate the reference model's RAM admission,
network latency, renewable share, or SLA formulas.

2.10 Why CSV, JSON, Python, and Matplotlib are used

JSON preserves nested scenario and experiment objects: settings, centers,
task records, regional totals, and timelines. CSV presents tabular results
that spreadsheets and plotting programs can read easily.

The Python script reads existing CSV files, validates their required data,
and uses Matplotlib to create scientific figures. Python is needed only
for this reporting stage, not for the simulation or web server. The plotting
script does not run the scheduler, alter input CSVs, or invent measurements.

2.11 Why Docker, Prometheus, Grafana, JMeter, and EC2 appear

Docker packages the app and Java replay into a repeatable runtime image.
Compose describes the app, Prometheus, and Grafana services together.

Prometheus periodically reads the Node server's /metrics endpoint. Grafana
queries Prometheus and displays the collected values. This separates
monitoring from the scheduling engine.

JMeter is an HTTP load-testing tool. The included plan repeatedly submits
scenario JSON to the API and checks the HTTP status. Its request latency
is actual service time, distinct from a simulated job's response time.

AWS EC2 can host this application as a virtual server. The EC2 guide explains
that deployment possibility. An EC2 instance hosting the simulator would
still simulate the four locations; it would not create a real distributed
AWS scheduling system.

The files for these integrations exist. Their existence is not evidence
that Docker, Grafana, JMeter, or EC2 deployment has been executed successfully.

2.12 No machine learning pipeline

This implementation has no trained model, training dataset, feature
extraction, model selection, prediction API, or validation split. Placement
uses explicit formulas and a weighted heuristic. The generated workloads
are experiment inputs, not machine learning training data.


3. WHAT THE USER GIVES THE APPLICATION
==========================================================================

The central input object is a scenario:

  scenario
    name       -> experiment description
    centers[]  -> data-center and per-host specifications
    settings   -> horizon, generator controls, scheduling policy and weights
    tasks[]    -> actual submitted workload descriptions
    profiles[] -> optional changes to regional electricity conditions

The same scenario format is understood by the browser, API, CLI exporter,
and reference engine. The saved sample is samples/scenario.json.

3.1 Data-center inputs

The Data centers page accepts these values through add/edit dialogs and
CSV import. Imports replace the current list rather than append to it.

  Field          Meaning and unit                         Validation
  -----------------------------------------------------------------------
  id             Unique stable identifier                 letters/digits/_/-
                                                          1 to 60 characters
  name           Display name                             1 to 100 characters
  region         Region label, e.g. eu-north-1             1 to 100 characters
  country        Descriptive country                      1 to 100 characters
  hosts          Number of identical hosts                integer 1 to 16
  cores          CPU cores PER HOST                       integer 1 to 64
  ram            RAM PER HOST in GB                       1 to 1024
  mips           Processing rate PER CORE                 1 to 100000
  idleWatts      IT power of one idle host in W           0 to 5000
  maxWatts       IT power of one fully loaded host in W   1 to 10000;
                                                          >= idleWatts
  pue            Facility energy multiplier               1 to 3
  carbon         Base carbon intensity in gCO2e/kWh        0 to 2000
  renewable      Base renewable supply share in %         0 to 100
  price          Base electricity price in USD/kWh        0 to 10
  latency        Configured network delay in ms           0 to 2000
  enabled        Whether this location participates       true or false

There can be at most 12 configured centers, and at least one must be enabled.
The browser generates an ID when adding a center. Region labels resembling
AWS regions remain labels; entering them does not connect to AWS.

Default locations, each with two eight-core, 32 GB hosts:

  Location       MIPS   Idle/Max W   PUE   Carbon   Renew %  USD/kWh  Lat ms
  -----------------------------------------------------------------------
  Mumbai         1000    45/250     1.20     650      25      .105      24
  Frankfurt      1200    40/240     1.15     330      58      .220     118
  Stockholm      1000    35/220     1.10      45      92      .120     152
  N. Virginia    1400    50/260     1.20     370      42      .095     208

Carbon values in this table are gCO2e/kWh. These are illustrative scenario
assumptions, not current measurements of these geographical regions.
Together the defaults contain 8 hosts, 64 CPU cores, and 256 GB RAM.

3.2 Workload inputs

Each task has the following fields:

  id          Unique task identifier, 1 to 80 characters.
  arrival     Submission time in simulated seconds, >= 0 and < horizon.
  length      TOTAL work across requested cores, in MI, 1 to 10^10.
  cores       Requested cores on one host, integer 1 to 64.
  ram         Reserved memory on that host, 0.1 to 1024 GB.
  deadline    Relative response deadline, 0.001 to 86400 seconds.
  maxLatency  Largest acceptable configured center latency, 0 to 2000 ms.
  origin      Descriptive source label, 1 to 100 characters.

The validator also bounds arrival at 86400 seconds. There must be 1 to 1000
actual task records. The application supports generated tasks or workload
CSV import; it does not provide a separate manual editing dialog per task.

For generated tasks, generateTasks(settings) uses:

  - count tasks, each named TASK-0001 and onward;
  - arrivals rounded from the first 70% of the observation horizon;
  - total work rounded from approximately 120000 to 480000 MI;
  - cores selected from [1, 2, 2, 4];
  - RAM equal to twice the selected core count in GB;
  - deadlines rounded from approximately 140 to 340 seconds;
  - maximum latency 100 ms for about 15% of generated tasks, otherwise 260;
  - origin label Bengaluru;
  - final sorting by arrival and then task ID.

The repeated 2 in the core list makes two-core requests more likely.
The settings seed controls repeatability. Change the generator settings
and use Generate to create a new task array; changing a seed alone does
not change already stored task records.

3.3 Scheduling and experiment settings

  name                1 to 150 characters.
  duration            Observation horizon, 10 to 86400 simulated seconds.
  seed                Generator seed, integer 0 to 2147483647.
  count               Generator count, integer 1 to 1000.
  carbonWeight        Relative carbon preference, 0 to 100.
  costWeight          Relative electricity cost preference, 0 to 100.
  responseWeight      Relative response-time preference, 0 to 100.
  renewableThreshold  Renewable-rich task classification threshold, 0-100%.
  policy              queue or reject when no candidate meets a deadline.

At least one weight must be positive. The default duration is 900 seconds,
seed 42, count 144, weights 65/15/20, threshold 70%, and policy queue.
Weights need not add to 100. Their relative sizes determine the decision.
The visual weight bar divides by their sum; the engine uses the entered
values directly in the weighted score.

Actual submitted work is tasks.length, not settings.count. Count controls
generation. Importing workload CSV also updates count to the imported size.
Changing the horizon can make an existing task's arrival invalid; validation
catches this instead of silently changing that task.

3.4 Optional time-varying electricity profiles

Each row contains:

  centerId, time, carbon, renewable, price

time is seconds from experiment start. From that time onward, the supplied
carbon intensity, renewable share, and price replace that center's previous
conditions until a later row takes effect. Before the first row, the base
center values apply. A row at time zero overrides them from the beginning.

Rows are sorted internally. A center/time pair must be unique. There can
be at most 2000 observations, referencing existing centers. Time is bounded
at 0 to 86400; other bounds match the corresponding center fields.

For example, Stockholm could have a base intensity of 45, then a profile
row at 50 seconds with intensity 100, renewable share 80, and price 0.15.
A task spanning seconds 0-100 is integrated as two 50-second segments.
This is a stepwise profile, not interpolation or a live data feed.

3.5 Import and validation behavior

CSV templates describe the required headers. The parser handles quoted
fields, escaped double quotes, line endings, and a UTF-8 byte-order mark.
It rejects missing/duplicate headers and inconsistent column counts.
Import handlers convert required numeric columns, require true/false for
center enablement, and validate the resulting scenario before committing it.

Imported center lists remove profile rows referencing centers no longer
present. Deleting an individual center removes its related profile rows.
The browser prevents disabling the last enabled center.

JSON import accepts a scenario or an experiment containing scenario. It
loads inputs and asks for a fresh run; it does not treat imported result
numbers as newly verified calculations. The browser import limit is 5 MB.


4. COMPLETE END-TO-END EXECUTION AND ARCHITECTURE
==========================================================================

4.1 Overall data flow

  Open the dashboard
       |
       v
  Load defaults + valid browser-saved inputs/history
       |
       v
  Configure centers / generate or import tasks / set scheduler / add profiles
       |
       v
  Validate scenario and take an input snapshot
       |
       +---------------- API available -----------------------+
       |                                                      |
       v                                                      v
  Browser Web Worker                               POST /api/experiments
       |                                                      |
       |                                         Server validates request
       |                                                      |
       +----------------------+-------------------------------+
                              v
                   Shared dist/engine.js
                              |
               +--------------+--------------+
               v              v              v
           Carbon-aware   Round-robin   Performance-first
               |              |              |
        Fresh host calendars for each independent strategy
               |              |              |
        Task ordering -> candidates -> deadline filter -> choice
               |              |              |
        Reserve CPU/RAM -> task status -> energy/resource integration
               |              |              |
               +--------------+--------------+
                              v
            Experiment JSON with metrics, tasks, centers, timeline
                              |
                   Server path only, if enabled and JAR exists
                              |
                              v
         Node spawns Java -> CloudSim replays carbon plan -> timing JSON
                              |
                              v
            Browser renders results and saves recent history
                              |
                  +-----------+-------------+
                  v                         v
          Dashboard downloads          Server /metrics
          CSV / experiment JSON             |
                                            v
                                    Prometheus -> Grafana

  Separate reproducible report path:

  samples/scenario.json (or another scenario JSON)
       -> scripts/export-results.mjs
       -> same reference engine + optional Java replay
       -> unit-explicit CSVs + full JSON + metadata in output directory
       -> scripts/plot-results.py
       -> validated CSV measurements
       -> PNG / PDF / SVG figures + source/checksum manifests

The branches share the engine but have different responsibilities. The
CLI writes project result files. Running an experiment in the browser does
not automatically overwrite results/sample/ on the server's disk.

4.2 Stage 1: Start the application and load the interface

Why: the user needs a visual workspace and an optional server execution path.
Input: server environment settings and a browser request to the app URL.
Component: server.mjs -> createAppServer() in server/app.mjs; dist/index.html.
Processing: Node listens on HOST/PORT, serving only the dist public directory.
The HTML loads app.js, ui.js, styles.css, and locally bundled font/icon assets.
Output: the browser displays the application shell and loads its modules.
Next: app.js restores or creates scenario state.

Default server binding is 127.0.0.1:3000. A different PORT must be an integer
from 0 to 65535. HOST can be changed for a deployment. Node handles shutdown
signals and allows a bounded period for the HTTP server to close.

4.3 Stage 2: Restore inputs and choose an execution route

Why: previous work should remain available and the same interface should
work when only static browser execution is available.
Input: defaults(), localStorage entries, and GET /api/health.
Component: app.js startup and state initialization.
Processing: saved scenarios are checked with validateScenario(); history
entries must contain valid scenarios and expected result structure. Up to
eight recent experiments are restored. Empty task inputs are generated.
The app probes the health endpoint with a short timeout and recognizes a
Verdant server by the returned service name.
Output: initialized state with scenario, optional displayed experiment,
history, dirty/busy flags, and an API-availability flag.
Next: a first experiment runs automatically if none was restored; otherwise
the reader sees the saved experiment and can edit or run again.

Browser storage is local to that browser origin. It is not an account or a
shared database. Storage failures produce a warning; results can still exist
in memory during that session.

4.4 Stage 3: Collect and save the user's scenario changes

Why: meaningful comparisons require explicit infrastructure and task inputs.
Input: center dialogs, CSV/JSON imports, generator forms, and scheduler form.
Component: app.js handlers, generateTasks(), parseCSV(), validateScenario().
Processing: convert field types, construct a proposed scenario, validate it,
and then commit it to state. Mark inputs as changed and persist them.
Output: an updated scenario and an indication that displayed results may
belong to older inputs.
Next: Run experiment evaluates the updated input snapshot.

Editing inputs does not silently rewrite old experiment results. Restoring
inputs from history and viewing a saved result are distinct operations.
This separation lets the user understand which scenario produced a result.

4.5 Stage 4: Submit a frozen input snapshot

Why: changing a form during processing must not change the running experiment.
Input: the current scenario when Run experiment is selected.
Component: async run() in app.js.
Processing: validate; deep-copy the scenario; set busy state; select route.
The API route posts JSON to /api/experiments. The browser-only route posts
the snapshot to a module worker using worker.js. Both have a 90-second
frontend timeout; the worker is terminated after completion or failure.
Output: either an execution request or a validation/error message.
Next: server or worker calls the shared engine.

API availability is selected during startup probing. If a selected API
request later fails, the current run reports the failure; it does not
silently retry that failed run in a worker.

4.6 Stage 5: Enforce the server API boundary

Why: incoming HTTP data must be checked independently of browser validation.
Input: request headers and scenario JSON body.
Component: createAppServer(), readJSON(), validateScenario() in server/app.mjs.
Processing: require JSON content, cap the body at 5,000,000 bytes, parse it,
validate it, and limit active experiment requests to two. The active limit
is checked before and after body processing. Busy responses use HTTP 429
with Retry-After; invalid input uses an error response rather than metrics.
Output: an admitted scenario or an HTTP error.
Next: runExperiment(scenario).

The Node reference computation itself is synchronous JavaScript. This
admission limit does not create a parallel CPU worker pool. Java replay
processes may remain active while Node handles other work.

4.7 Stage 6: Create three independent strategy runs

Why: a comparison must not let one strategy inherit another's bookings.
Input: a validated scenario snapshot.
Component: runExperiment() and runAlgorithm() in dist/engine.js.
Processing: create experiment ID/time, clone inputs for provenance, and run
each strategy with fresh host calendars. Enabled centers are selected;
their profile rows are sorted; hosts are expanded from center specifications.
Output: three result objects built from the same submitted scenario.
Next: each strategy's task-by-task placement loop.

4.8 Stage 7: Schedule every task

Why: placement affects both immediate performance and resources left for
later jobs, so decisions must follow an explicit order.
Input: tasks sorted by arrival, breaking ties by task ID; current bookings.
Component: runAlgorithm(), earliestSlot(), integrate().
Processing: for each host, check CPU/RAM/network eligibility, find the
earliest feasible reservation, calculate execution and response, estimate
its full-interval task footprint, apply deadline policy, and select using
the strategy's decision rule. Section 5 explains each operation precisely.
Output: either a rejection record or a chosen host booking and task result.
Next: the booking influences all later task candidate calculations.

4.9 Stage 8: Classify tasks and integrate resource consequences

Why: a planned task can extend past the experiment horizon, and an idle
host still contributes electricity consumption.
Input: all bookings, task decisions, profiles, host power values, and horizon.
Component: the task-result, dcStats, and timeline portions of runAlgorithm().
Processing: classify completed/running/queued/rejected jobs; clip measured
execution to the horizon; integrate idle and dynamic energy for each host;
accumulate CPU/RAM reservation seconds; count completions into 24 time bins.
Output: per-task results, per-center totals, and per-interval energy/carbon
and completion counts.
Next: aggregate the global comparison metrics.

4.10 Stage 9: Aggregate metrics and assemble the experiment

Why: a user needs totals and service-quality measures as well as placements.
Input: regional totals, completed tasks, resource seconds, and task statuses.
Component: metrics creation in runAlgorithm(); results assembly in runExperiment().
Processing: sum energy/carbon/cost, calculate energy-weighted renewable share,
renewable-rich completion percentage, mean/P95 response, SLA, utilization,
throughput, and status counts using the definitions in Section 6.
Output: experiment.results.carbon, .roundRobin, and .performance, each with
algorithm, metrics, centers, tasks, and timeline.
Next: server-side optional replay, or direct return from the browser worker.

4.11 Stage 10: Replay the carbon-aware CPU execution in Java

Why: timing agreement with another simulator is more informative than
checking the reference engine only against its own formulas.
Input: scenario plus experiment.results.carbon.tasks.
Component: replayExperiment() in server/cloudsim.mjs -> Replay.main() in Java.
Processing: Node starts java -jar and writes JSON to standard input. Java
creates simulated data centers, hosts, VMs, and cloudlets, binding each task
to its planned VM and delayed submission time. It runs the CloudSim event
simulation and reports actual CPU start/finish times.
Output: JSON containing replay scope, task timing rows, completion count,
simulation clock, and mean absolute finish-time deviation.
Next: Node attaches this result as experiment.cloudsim and returns JSON.

The server attempts replay when enabled and the JAR exists. Setting
CLOUDSIM_REPLAY=false disables it on the server. JAR existence is not a full
Java health check. Node bounds replay time at 45 seconds and stdout at
4,000,000 bytes, and reports spawn/timeout/parse/process errors.

If server replay fails, the already calculated reference experiment is kept,
cloudsimError is attached, and the UI can warn the user. The CLI exporter
also checks JAR availability, but a replay exception there stops the script;
it does not use the server's recover-and-return behavior.

4.12 Stage 11: Present and retain results

Why: results must be inspectable and associated with their original inputs.
Input: experiment JSON from the API or worker.
Component: app.js rendering functions and persist(); ui.js presentation.
Processing: make the experiment active, prepend it to the eight-entry
history, compare its snapshot with current inputs, render graphs/tables/
cards, and save state to localStorage where available.
Output: the displayed experiment, task details, comparison charts, and history.
Next: user exports, changes inputs, or runs another experiment.

4.13 Stage 12: Observe the service through monitoring

Why: simulated outcomes and actual application behavior are both useful,
but must be interpreted on different time scales.
Input: the latest server experiment and HTTP request counters.
Component: server/app.mjs /metrics -> Prometheus -> Grafana provisioning.
Processing: expose modeled latest-run gauges and actual service counters.
Prometheus is configured to scrape app:3000 every five seconds. Grafana's
provisioned dashboard queries those series through the Prometheus data source.
Output: monitoring panels for modeled carbon/energy/cost/SLA/response/
renewable share/throughput/regional CPU and real API requests/errors/duration.
Next: operational inspection when the monitoring stack is running.

A horizontal Grafana line may simply mean the latest experiment has not
changed. Its timestamps are scrape times, not progress through a simulated
900-second workload. For simulated time progression, use the application's
timeline or time_series.csv. Browser-worker experiments do not update the
Node server's latest experiment gauges.

4.14 Stage 13: Produce a reproducible report dataset

Why: report figures need unit-explicit tabular inputs and provenance.
Input: scenario JSON path and an output directory.
Component: scripts/export-results.mjs.
Processing: run the same engine; export input and result CSVs; optionally
replay in Java; save full experiment JSON and metadata. Metadata records a
SHA-256 hash of JSON.stringify(parsedScenario), the source path, assumptions,
and comparison changes relative to round-robin.
Output: the report dataset described in Section 8.
Next: Python reads its CSV files.

The hash identifies the parsed object's serialized content, not the original
file's byte-for-byte formatting. Re-exporting into a directory overwrites
named outputs. Use a fresh directory for a distinct experiment, particularly
when replay availability changes: the exporter does not purge an old replay
CSV left in a reused directory, and a failed export can leave partial files.

4.15 Stage 14: Generate report figures from CSV

Why: a report figure should be traceable to saved values, independently of
the dashboard and without running another experiment.
Input: strategy_comparison.csv, data_center_results.csv, time_series.csv,
and optionally cloudsim_execution_replay.csv.
Component: load_inputs(), Graphs.generate(), and main() in plot-results.py.
Processing: validate required headers, finite nonnegative values, labels,
status-count sums, percentage bounds, and relevant row relationships. Read
scenario descriptions from CSV columns. Create figures with units and notes.
For replay figures, calculate deviations from planned/actual CSV timings.
Output: up to 18 figures, by default in PNG, PDF, and SVG, plus manifests.
Next: include selected figures and their interpretations in the report.

Before plotting, SHA-256 checksums are taken for every CSV actually read.
The program checks them again after plotting. graph_sources.csv records
the source columns for each image; input_checksums.csv identifies the input
bytes. These are traceability checks, not scientific validation of the
power model or proof of an original data source.


5. SCHEDULING ALGORITHMS AND DECISION RULES
==========================================================================

5.1 Candidate construction

A candidate is one feasible host and its earliest available execution
interval for the current task. The engine considers every host at enabled
locations. Before scheduling time is considered, it removes a host if:

  requested cores > that host's core count, OR
  requested RAM   > that host's RAM, OR
  center latency  > the task's maximum latency.

CPU and RAM are hard capacity limits. Latency is also a hard limit, even
under the queue fallback policy. A clean but network-ineligible center
never reaches scoring.

5.2 Finding the earliest feasible slot

earliestSlot(host, task, duration) uses an explicit reservation calendar.

  1. Consider the task's arrival and previously booked finish times at or
     after arrival as possible starts, sorted in increasing order.
  2. For a candidate start, form [start, start + duration).
  3. Find existing bookings overlapping that interval.
  4. Check resource totals at the candidate start and each overlapping
     booking's start inside the interval, where occupancy can increase.
  5. Accept the first interval where both CPU and RAM remain within limits.

Bookings ending at an instant release resources for tasks starting then.
Checking only the beginning of a proposed interval would be insufficient:
an already reserved task might begin halfway through it.

Example: an eight-core host has a four-core booking from seconds 10 to 50.
A new six-core task arriving at 0 with duration 30 cannot occupy 0-30,
because 6 + 4 exceeds 8 after second 10. A start at 50 can be feasible.

The search is for the earliest resource-feasible start. It does not create
extra candidates that deliberately wait for a cleaner electricity period.
It may nevertheless evaluate a future interval because existing load forces
the task to wait, and profiles for that future interval affect its score.

5.3 Execution time, waiting, and deadline preference

For each candidate:

  D = task.length / (center.mips * task.cores)
  S = earliest feasible start
  F = S + D
  W = S - task.arrival
  R = F - task.arrival + center.latency / 1000
  deadline feasible when R <= task.deadline + a small numeric tolerance

First collect candidates meeting the deadline. If any exist, ALL three
strategies select only from that compliant set. This makes round-robin and
performance-first constrained baselines, rather than deliberately invalid
straw-man alternatives.

If no candidate meets the deadline:

  queue policy  -> use resource/network-feasible candidates anyway;
                   record deadlineFallback=true for the chosen task.
  reject policy -> reject the task without a booking.

Queue here means retaining an overdue plan, which may wait for resources.
It does not guarantee that the task will complete before the horizon.
If no host satisfies resources and latency at all, both policies reject.

5.4 Carbon-aware selection: normalize, weight, choose

Carbon, USD, and seconds have different scales. Adding raw values would
let units dominate the decision, so each objective is min-max normalized
over the currently available HOST candidates for this task:

  normalized x = (x - minimum x) / (maximum x - minimum x)

If the range is effectively zero, every candidate gets zero for that
objective because it cannot distinguish them.

The engine then computes:

  score = carbonWeight   * normalized carbon
        + costWeight     * normalized electricity cost
        + responseWeight * normalized response time

Lower is preferred. Near-equal scores are broken by earlier response.
If both remain equal, the existing candidate iteration order is retained.

Carbon and cost for ranking come from the candidate's task-attributed
energy over its FULL planned execution interval:

  task allocation watts = host.maxWatts * requested cores / host cores
  candidate energy      = integrate(allocation watts * PUE over execution)
  candidate carbon      = sum(segment kWh * segment carbon intensity)
  candidate cost        = sum(segment kWh * segment electricity price)

This is a task footprint proxy. It is not a calculation of the complete
facility's incremental energy change. Section 6 explains why the final
facility total uses a different power accounting expression.

Example: with weights 65/15/20, a placement with normalized carbon 0,
cost 0.4, and response 1 scores 26. A placement with 0.5, 0, 0 scores 32.5.
The first is selected despite responding later. Different weights can
reverse that decision. Multiplying every weight by the same positive
factor changes score scale but not the ranking.

Bounds are recomputed for each task's available set. Consequently, scores
are local ranking values, not absolute carbon-efficiency measurements or
values that should be compared across different tasks and scenarios.

5.5 Round-robin baseline

Round-robin keeps a pointer into enabled data centers in scenario order.
Starting from the pointer, it scans for the next center with available
candidates, chooses its earliest-response host, and advances the pointer
to the following center. Initial selection starts at the first center.

Its purpose is to represent a simple rotation policy. It does not promise
equal task counts when centers are infeasible, deadlines differ, or tasks
require different amounts of work.

5.6 Performance-first baseline

Performance-first chooses the available candidate with the smallest
estimated response time, including waiting, execution, and configured
latency. It is not simply a highest-MIPS rule: a faster but busy host can
lose to a slower idle host. Exact ties retain the first candidate.

5.7 Booking and finite-horizon status

After a choice, the engine adds {start, end, cores, ram} to the selected
host's calendar. Later tasks see this reservation. The task retains its
input fields and gains center/host, timings, attributed energy, reason,
deadlineFallback, and service result fields.

With observation horizon H:

  completed -> planned CPU finish + latency seconds <= H
  running   -> not completed, but planned start < H
  queued    -> planned start >= H
  rejected  -> no admitted placement

The running label can include a task whose CPU ends just before H but whose
modeled response arrives after H. This follows the implemented classification.
Plans can extend beyond H. Their ranking used full execution, while reported
task and facility energy count only the part within H.

5.8 Complexity and optimization limits

Each task scans eligible hosts and their booking calendars. Slot search
rechecks intervals against existing bookings, so cost grows with workload
and host count. This is a direct research implementation, not a specialized
large-scale scheduling data structure. Limits of 1000 tasks and 12 centers
are input bounds, not a benchmarked guarantee of fast worst-case execution.

Tasks are scheduled in arrival order with known scenario inputs. Decisions
are not revised later; there is no preemption, migration, global search,
stochastic optimizer, or automatic adaptation after a run starts.


6. ENERGY ACCOUNTING AND THE MEANING OF EVERY METRIC
==========================================================================

6.1 Segment integration

conditions() takes a center's base conditions and applies the latest profile
observation at or before a given simulated time. integrate() splits an
interval at every profile change inside it and sums its segment values.

For a constant segment with length dt seconds:

  energy kWh     = watts * PUE * dt / 3,600,000
  emissions g    = energy kWh * carbon intensity gCO2e/kWh
  cost USD       = energy kWh * price USD/kWh
  renewable kWh  = energy kWh * renewable percentage / 100

The divisor converts watt-seconds to kilowatt-hours. Negative or empty
overlap durations contribute zero. Splitting at profile boundaries avoids
using an inaccurate unweighted average over changing conditions.

Example using the optional profile described earlier: 60.5 W of facility
power for 100 seconds uses 0.001680556 kWh. If its first 50 seconds have
intensity 45 and its last 50 have intensity 100, carbon is:

  0.000840278 * 45 + 0.000840278 * 100 = 0.1218403 gCO2e.

6.2 Facility energy includes all enabled hosts

The final facility power model is linear in reserved CPU utilization:

  IT host power = idleWatts + (maxWatts - idleWatts) * CPU utilization

Every enabled host is assumed powered on for the whole horizon, even when
no task is assigned to it. For each host and timeline bin, the code adds:

  idle energy for the entire bin
    + dynamic energy for each booking's overlap with that bin,
      using (maxWatts - idleWatts) * task.cores / host.cores.

PUE and profile-dependent carbon/price/renewable conditions are applied to
both parts. The sum never needs to exceed maxWatts when CPU admission holds.

This includes operational facility electricity only. It excludes embodied
hardware emissions, network energy, storage energy, water use, hardware
lifecycle effects, and financial costs other than modeled electricity.

6.3 Why task values do not add up to facility totals

Per-task attribution uses maxWatts * task core fraction during that task's
execution. Facility accounting uses idle power everywhere plus the dynamic
power increment for occupied cores. Unused capacity and unassigned idle
power therefore make task and facility values different accounting views.

Never sum task_results.csv attributed energy or carbon and label the result
as the project's facility total. Use strategy_comparison.csv or sum regional
facility totals. The exact one-task example in Section 7 makes this visible.

6.4 The 24-bin timeline

The horizon is divided into 24 equal intervals. With the default 900-second
horizon, each interval is 37.5 seconds. Integration is exact with respect
to booking overlaps and stepwise profile boundaries within those bins;
the bins are for reporting, not a coarse 37.5-second scheduling clock.

Each timeline row stores interval energy, interval carbon, and the number
of modeled response completions assigned to that bin. Cumulative values
are obtained by adding rows in time order. Completion bin assignment uses
a floor operation on response-finish time, capped to the last bin; a finish
exactly at an internal boundary belongs to the following bin. Treat these
as binned counts, not an exact event trace.

6.5 Metric definitions and denominators

Carbon emissions:
  Sum of enabled-center facility emissions within H, in gCO2e.
  It includes idle and PUE overhead and any partial execution within H.

Energy consumption:
  Sum of enabled-center facility energy within H, in kWh.

Electricity cost:
  Sum of facility segment kWh * segment USD/kWh. It is not an AWS bill;
  VM rental, tax, storage, and transfer charges are not modeled.

Renewable energy utilization:
  100 * facility renewable kWh / total facility kWh.
  This is energy-weighted, not an average of center percentages.
  If total energy is zero, the implementation reports zero.

Renewable-rich completed tasks:
  For each completed task, calculate its attributed, energy-weighted
  renewable share. Count tasks whose share >= renewableThreshold.
  Report 100 * qualifying completed / completed, or zero if none completed.
  This is the implemented interpretation of "workloads using renewable
  energy"; it does not mean those jobs received exclusively renewable power.

Task completion:
  Completed response arrivals within H, plus separately counted running,
  queued, and rejected records. These four counts sum to submitted tasks.

Average response time:
  Mean of response seconds for completed tasks ONLY. A task finishing after
  its deadline but within H is included. If no task completes, value is null
  in the engine and blank/N/A in reporting, rather than a zero-second result.

P95 response time:
  Sort completed responses ascending and take nearest-rank index
  ceil(0.95 * number completed) - 1, using zero-based indexing.
  No completed tasks means null. A single completed task has P95 = its mean.

CPU utilization:
  100 * occupied core-seconds within H /
        (H * total enabled host core capacity).

RAM utilization:
  100 * reserved GB-seconds within H /
        (H * total enabled host RAM capacity).

Regional utilization uses the same formulas restricted to that center.
Fleet utilization is capacity-weighted, not an unweighted mean of regional
percentages. These describe simulated reservations, not the real CPU/RAM
usage of the laptop or EC2 instance running the simulator.

SLA compliance:
  A task passes when it completes within H and its modeled response meets
  its relative deadline. Accepted placements already obey hard latency and
  resource checks. Report 100 * passing tasks / ALL submitted tasks.
  Rejected, queued, unfinished, and overdue completed tasks do not pass.

Load distribution:
  Assigned and completed task counts per center, supported by regional
  CPU/RAM utilization. Assignment counts alone do not measure equal work:
  a long four-core job differs from a short one-core job.

Throughput:
  completed / H in tasks per simulated second.
  Dashboard and a report column also show this multiplied by 60 as tasks
  per simulated minute. It is not HTTP API requests per real second.

6.6 Comparing a strategy against a baseline

The saved metadata and overview use round-robin for the carbon comparison:

  carbon reduction % = 100 * (RR carbon - carbon-aware carbon) / RR carbon
  cost reduction %   = 100 * (RR cost - carbon-aware cost) / RR cost
  response increase %= 100 * (carbon-aware mean - RR mean) / RR mean
  SLA change         = carbon-aware SLA% - RR SLA%, in percentage points
  completion change  = carbon-aware completed - RR completed

Zero reference denominators and missing response measurements make the
relevant comparison unavailable rather than meaningful zero improvement.
The same submitted workload and horizon do not guarantee the same completed
useful work. Inspect completion and SLA beside environmental totals.


7. ONE COMPLETE, VERIFIED EXAMPLE
==========================================================================

This small teaching scenario was executed through the current reference
engine and the existing Java replay while preparing this guide. It is
separate from the saved 144-task report experiment. All values below are
rounded for reading; calculations use the unrounded values.

7.1 Initial input

Use the four default locations and their eight initially idle hosts.
Use no energy profiles. Set horizon to 300 seconds, weights to 65/15/20,
renewable threshold to 70%, and policy to queue. Submit exactly one task:

  id:          EXAMPLE-001
  arrival:     0 seconds
  length:      200000 total MI
  cores:       2
  ram:         4 GB
  deadline:    160 seconds after arrival
  maxLatency:  260 ms
  origin:      Bengaluru

The scenario has count=1 and tasks.length=1. It can be described as workload
CSV with the task headers or supplied as a full scenario JSON.

7.2 Browser to engine

The user loads these inputs and runs the experiment. Validation succeeds:
the arrival is inside the horizon, the workload is positive, all locations
are valid, and the weight sum is positive. run() clones the scenario.
On the local server route it sends JSON to /api/experiments. The server
checks it and calls runExperiment().

The engine constructs a fresh eight-host calendar for each strategy.
EXAMPLE-001 is the only task, so it is processed first. Each host has at
least two cores and 4 GB free. All center latencies are <= 260 ms.

7.3 Candidate timing calculations

All candidate starts are zero. The two identical empty hosts at each
location produce the same candidate values:

  Location       CPU duration s   Response s    Deadline 160 s?
  ------------------------------------------------------------
  Mumbai            100.000       100.024       yes
  Frankfurt          83.333        83.451       yes
  Stockholm         100.000       100.152       yes
  N. Virginia        71.429        71.637       yes

For Stockholm: 200000 / (1000 * 2) = 100 seconds. Network delay adds
152 / 1000 = 0.152 seconds. Waiting is zero. All candidates enter scoring
because all satisfy the deadline as well as resource and latency limits.

7.4 Candidate footprint and score calculations

For Stockholm, allocated IT power is 220 * 2/8 = 55 W. Facility-adjusted
allocated power is 55 * 1.1 = 60.5 W. Its task estimate becomes:

  energy = 60.5 * 100 / 3600000 = 0.001680556 kWh
  carbon = 0.001680556 * 45     = 0.075625 gCO2e
  cost   = 0.001680556 * 0.12   = 0.000201667 USD

The corresponding values and weighted scores for every location are:

  Location       Task kWh      Task gCO2e   Task USD       Score
  ----------------------------------------------------------------
  Mumbai         .002083333    1.354167     .000218750      90.1748
  Frankfurt      .001597222     .527083     .000351389      46.2383
  Stockholm      .001680556     .075625     .000201667      24.0107
  N. Virginia    .001547619     .572619     .000147024      25.2668

Stockholm has the minimum carbon estimate. N. Virginia has the minimum
cost and response. Frankfurt has the maximum cost; Stockholm the maximum
response. The min-max formula puts each objective on a 0-1 scale across
these candidates before weights 65, 15, and 20 are applied.

Stockholm's score is slightly lower than N. Virginia's. The carbon-aware
strategy therefore selects stockholm-0. This demonstrates a real tradeoff:
the selected candidate is cleaner but is not the fastest or cheapest task
estimate. Each location's duplicate host candidate ties; the first is kept.

Round-robin begins with the first configured eligible location, so it
selects mumbai-0. Performance-first selects virginia-0 for the minimum
71.636571-second response.

7.5 Reservation and task record

For the carbon-aware run, the booking is:

  host stockholm-0: start=0, end=100, cores=2, ram=4

The task result includes:

  status=completed, waiting=0, duration=100, response=100.152,
  centerId=stockholm, hostId=stockholm-0,
  sla=true, deadlineFallback=false,
  energy=.001680556 kWh, carbon=.075625 gCO2e,
  cost=.000201667 USD, renewableShare=92%.

Why completed? Its modeled response finishes at 100.152, before horizon 300.
Why SLA true? That response is also before the 160-second relative deadline.
Why renewable-rich? 92% is above the configured 70% threshold.

7.6 Facility accounting across all eight hosts

The project does not turn unused hosts off. Their 300-second idle energy is:

  Mumbai:       2 * 45 * 1.2  * 300 / 3600000 = .009000000 kWh
  Frankfurt:    2 * 40 * 1.15 * 300 / 3600000 = .007666667 kWh
  Stockholm:    2 * 35 * 1.1  * 300 / 3600000 = .006416667 kWh
  N. Virginia:  2 * 50 * 1.2  * 300 / 3600000 = .010000000 kWh
  Total idle:                                      .033083333 kWh

The Stockholm task adds dynamic power above idle:

  (220 - 35) * 2/8 = 46.25 W of IT power for 100 seconds
  dynamic facility energy = 46.25 * 1.1 * 100 / 3600000
                          = .001413194 kWh

Total facility energy is .034496528 kWh. Applying each location's own
intensity gives total facility carbon 12.432344 gCO2e, and applying each
price gives cost .004521250 USD. These are much larger than the task-only
estimate because the other hosts and unused time still consume energy.

The fleet's renewable share is 52.469451%, even though this completed
task's attributed renewable share is 92%. The percentage of renewable-rich
completed tasks is 100% because its denominator is one completed task.
Those two percentages answer different questions.

7.7 Remaining carbon-aware metrics

  completed/running/queued/rejected = 1 / 0 / 0 / 0
  SLA compliance                  = 100%
  mean and P95 response            = 100.152 seconds
  throughput                      = 1/300 tasks/s = 0.2 tasks/minute
  CPU utilization                 = 2*100 / (64*300) * 100 = 1.041667%
  RAM utilization                 = 4*100 / (256*300)*100 = 0.520833%

The 300-second horizon creates 24 bins of 12.5 seconds. Idle energy appears
throughout. Dynamic Stockholm energy appears during CPU execution 0-100.
The response completion at 100.152 seconds falls in the next relevant
reporting bin and appears in cumulative task completion from then onward.

7.8 Java replay of the same decision

Node sends the scenario and carbon task plan to Replay.main(). Java creates
the modeled locations and host-sized VMs. EXAMPLE-001 is bound to the
Stockholm VM and given per-core work:

  round(200000 / 2) = 100000 MI on each of 2 cores.

The verified replay returned CPU start 0.0002 seconds and finish 100.0103
seconds, compared with planned CPU start 0 and finish 100. The finish
deviation is |100.0103 - 100| = 0.0103 seconds. Its final event clock was
301.0204 seconds; an event clock slightly beyond the horizon is possible.

This comparison uses CPU finish 100, not reference response 100.152.
CloudSim does not add the application's configured network latency here.
It also does not replace the carbon/energy/SLA results above. Event and VM
setup timing, scheduling events, and rounded per-core lengths can create
small timing differences.

7.9 Return, presentation, and report path

The API returns the three reference results with optional replay JSON.
The browser displays the carbon-aware facility metrics, comparative series,
and task decision, then retains the experiment in recent local history.

If this scenario is passed to the CLI exporter, strategy_comparison.csv
contains three rows, task_results.csv contains three rows for the same
task under different strategies, and data_center_results.csv contains
four regional rows per strategy. time_series.csv contains 24 rows per
strategy. Python then reads these report CSVs to plot their saved values.

7.10 How constraints can change this answer

Change this task's maxLatency from 260 to 100 ms. Frankfurt, Stockholm,
and N. Virginia are filtered out before scoring. Mumbai becomes the only
eligible location. Increasing carbon weight cannot override that limit.

Alternatively, set a deadline shorter than every candidate response. With
queue, the task can still receive a placement with deadlineFallback=true
and later fail the SLA. With reject, it receives no booking. These cases
explain why the application can show both high throughput and imperfect
SLA, or high renewable share and a rejected latency-sensitive task.


8. UNDERSTANDING THE DASHBOARD AND EXPORTED OUTPUTS
==========================================================================

8.1 Overview

The top four cards display the CARBON-AWARE strategy's facility emissions,
energy, renewable share, and SLA. The emissions card compares against
round-robin. Completion counts alongside the SLA card are supporting
context; completion percentage and SLA percentage are different metrics.

The impact chart compares all three strategies and switches between
cumulative carbon, energy, and completed tasks. It is drawn from the result
timeline, not a stream of live electricity measurements. The dashboard
uses a small set of sampled display points from that timeline; the report
CSV retains all 24 intervals per strategy.

The illustrative region map and regional CPU panel show carbon-aware
placement. Default coordinates are presentation positions; this is not
a geocoding or geographic distance calculation service.

The strategy comparison table provides cross-strategy results. Additional
cards cover cost, mean/P95 response, throughput, renewable-rich tasks,
CPU/RAM, completion, and rejections. The workload activity table supports
strategy selection, search, status filters, pagination, and task details.
Changing its strategy selector does not switch the top carbon-aware cards.

8.2 Data centers

This page lets the user add, edit, remove, enable, disable, and import
locations and download templates. It also handles optional energy-profile
imports and clearing profiles. Its purpose is to explain the scenario
assumptions, not discover infrastructure from a cloud provider.

8.3 Workloads

This page generates tasks from count/seed/horizon controls and accepts CSV
imports. Before a new run, changed workload inputs can be inspected. After
a run, the table can display the selected strategy's results. Search and
status filters help locate a job without changing its computed values.

8.4 Scheduler

This page saves the experiment name, observation horizon, objective weights,
renewable threshold, and deadline fallback policy. The three strategies
are all evaluated when an experiment runs; the sliders tune the weighted
carbon strategy rather than selecting which baseline is executed.

8.5 Experiments

Recent experiments can be viewed, downloaded as JSON, or used to restore
their input scenario. History holds at most eight entries in browser
storage. Clearing history leaves the current input configuration. Restoring
default sample inputs leaves history available. Neither action represents
server database administration because no such database is implemented.

8.6 Methodology and presentation

The Methodology page provides in-app explanations of the model and its
boundaries. ui.js adds responsive navigation, focus management, keyboard
support, chart tooltips, and chart geometry adaptation. styles.css provides
layout breakpoints, reduced-motion rules, and print styling. These are
presentation features; they do not modify scenarios or computed results.
The bundled Manrope font includes its OFL license.

8.7 Browser downloads versus report exports

The browser exports experiment/scenario JSON and convenient result CSVs.
Those CSVs use shorter engine-oriented keys and task subsets.

The CLI report exporter creates unit-explicit schemas, for example
carbon_gco2e and average_response_seconds. The Python report script expects
these CLI schemas. Therefore, a browser summary CSV is not a drop-in input
for plot-results.py, even if its visible metric values represent the same
experiment. Use CLI report exports for the included graph pipeline.

CSV writing quotes fields and escapes embedded quotes. Formula-like cell
prefixes are escaped for spreadsheet safety. This is useful output handling,
not evidence that arbitrary untrusted files need no further precautions.

8.8 Canonical report dataset in results/sample/

  strategy_comparison.csv
    One row per strategy. Explicit units, all aggregate requested metrics,
    task status counts, horizon, and seed. Primary source for strategy plots.

  task_results.csv
    One row per submitted task per strategy. Inputs, selected center/host,
    timings, status, deadline fallback, SLA, task-attributed footprint, and
    scheduling explanation. Default experiment: 144 * 3 = 432 rows.

  data_center_results.csv
    Regional assignment/completion counts, facility energy/carbon/cost,
    renewable energy/share, and CPU/RAM utilization. Default: 4 * 3 = 12 rows.

  time_series.csv
    Interval start/end, interval and cumulative carbon/energy/completion.
    Default: 24 * 3 = 72 rows.

  cloudsim_execution_replay.csv
    Optional carbon-plan CPU timings: per-core work, VM speed, planned and
    actual start/finish, absolute deviation, and completed-within-horizon flag.
    This is not a fourth scheduling strategy or a three-strategy replay.

  input_data_centers.csv, input_workloads.csv, input_energy_profiles.csv
    Tabular input snapshots. The sample profile file contains its header
    with no observations because the saved sample uses fixed conditions.

  input_scenario.json
    Full scenario snapshot, retaining the nested input representation.

  full_experiment.json
    Complete engine outputs and optional replay results, suitable for
    inspecting data that is not exposed in a compact dashboard CSV.

  metadata.json
    Input hash, generation/source information, accounting scope, scenario
    size, round-robin comparison changes, and optional replay summary.

  README.md
    A generated explanation specific to that result set. This differs from
    the project-root README.md and this comprehensive README.txt.

The older results/carbon-aware-results.zip is not the canonical current
report dataset. Use results/sample/ and its graphs_from_csv/ outputs when
discussing the current saved experiment.

8.9 Report figures generated by Python

The figure names identify their content:

  01_carbon_emissions                 Strategy emissions in gCO2e
  02_renewable_energy_utilization      Energy-weighted renewable percentage
  03_renewable_workloads_percentage    Renewable-rich completed-task share
  04_electricity_cost                 Modeled electricity cost in USD
  05_response_time                    Completed-task mean and P95
  06_resource_utilization             Fleet CPU and RAM percentages
  07_task_completion                  Completed/running/queued/rejected
  08_energy_consumption               Facility energy in kWh
  09_sla_compliance                   Passing tasks / all submitted tasks
  10_load_distribution                Assigned tasks by data center
  11_throughput                       Completed tasks per simulated minute
  12_carbon_over_time                 Cumulative emissions by simulated time
  13_energy_over_time                 Cumulative energy by simulated time
  14_task_completion_over_time        Cumulative completed tasks
  15_regional_cpu_utilization         CPU reservation use by center/strategy
  16_regional_ram_utilization         RAM reservation use by center/strategy
  17_cloudsim_execution_validation    Planned versus actual CPU finishes
  18_cloudsim_timing_deviations        Histogram of absolute finish deviation

The first sixteen are the main outcome figures. The final two require
replay CSV rows marked completed_within_horizon=true; otherwise they are
skipped. By default, 18 figures produce 54 image files: PNG, PDF, and SVG
versions of each. PNG is convenient for a document; PDF/SVG preserve vector
graphics for publication-quality scaling.

For a focused report, prioritize 01, 05, 07, 09, 10, 12, and 17, then add
renewable, energy, cost, utilization, and throughput figures as needed.
Captions should state the scenario, units, simulation scope, and tradeoffs.
The script's manifests make each figure traceable to its CSV columns.


9. WHAT THE SAVED EXPERIMENT ACTUALLY DEMONSTRATES
==========================================================================

The current results/sample/ experiment uses four enabled centers, eight
hosts, 144 submitted tasks, seed 42, a 900-second horizon, default weights
65/15/20, threshold 70%, queue policy, and no profile changes.

Values below are read from strategy_comparison.csv and metadata.json,
rounded for explanation. They are modeled outcomes, not live cloud readings.

  Metric                    Carbon-aware   Round-robin   Performance-first
  -----------------------------------------------------------------------
  Carbon, gCO2e                130.699       158.449          155.558
  Energy, kWh                    .396444      .404668          .403043
  Electricity cost, USD          .051357      .053730          .053668
  Renewable energy share, %    56.062        49.528           49.277
  Renewable-rich tasks, %      29.545        19.565           15.603
  Completed tasks             132           138              141
  Running tasks                12             6                3
  Queued / rejected             0 / 0         0 / 0            0 / 0
  Mean response, seconds      184.283       172.667          158.322
  P95 response, seconds       428.834       380.886          312.223
  SLA compliance, %            80.556        79.167           79.167
  CPU utilization, %           64.941        65.130           64.309
  RAM utilization, %           32.470        32.565           32.155
  Throughput, tasks/min         8.8           9.2              9.4

Compared with round-robin, the carbon-aware run has:

  17.513% lower modeled carbon;
   4.416% lower modeled electricity cost;
   6.727% higher completed-task mean response time;
   1.389 percentage points higher SLA compliance;
   6 fewer tasks completed within the same horizon.

Its SLA is 116 passing tasks out of 144, not 132/144. Some completed jobs
miss deadlines, while unfinished jobs also count against compliance.
Round-robin and performance-first each have 114 passing tasks here.

This supports a specific conclusion: under this scenario, environmental
placement changes reduce estimated total emissions while introducing
performance and completion tradeoffs. It does not establish that 17.513%
is a universal improvement, that every workload benefits, or that equal
useful work was completed at lower carbon. Comparisons across many seeds,
loads, time profiles, and useful-work-normalized metrics remain future work.

The saved CloudSim replay submitted 144 carbon-plan cloudlets and counted
132 completed within the CPU observation horizon. Its mean absolute CPU
finish-time deviation is approximately 0.137943 seconds for the completed
within-horizon tasks. This is timing agreement evidence, not calibration
against real hardware, energy measurements, or live grid emissions.

The sample is a single deterministic experiment. There are no repeated-run
confidence intervals or statistical significance claims in these files.


10. CONNECTING THE WORKFLOW TO THE SOURCE CODE
==========================================================================

10.1 Application entry and HTTP boundary

server.mjs starts execution for npm start. It reads the host/port environment,
creates the app server, begins listening, reports replay JAR availability,
and handles termination signals.

server/app.mjs exports createAppServer(). It owns the HTTP handlers, body
parsing, validation boundary, experiment admission limit, optional replay
invocation, static-file handling, monitoring state, and Prometheus output.

The useful HTTP routes are:

  GET  /api/health       Identify the app and report replay JAR availability.
  POST /api/experiments  Receive a scenario and return computed experiment JSON.
  GET  /metrics          Prometheus text exposition.
  GET/HEAD static paths Serve authored dashboard assets from dist/.

Unknown API paths return errors. Static paths are constrained to the public
directory, with content types and security headers. There is no login,
authorization layer, user account service, shared results database, or public
multi-tenant deployment architecture. Server monitoring state is in memory
and resets when the process restarts.

10.2 Interface and user-state orchestration

dist/index.html creates the shell, navigation targets, main content area,
dialog, status/toast elements, import input, and module entry scripts.

dist/app.js owns scenario state and user actions. Important functions:

  persist(), markDirty()         Retain inputs/history and flag changes.
  render()                      Render the current hash-routed page.
  overview(), detailMetrics()    Present carbon-aware metrics and context.
  chart(), regionMap()          Draw comparison timelines and region display.
  comparisonTable(), utilization() Present strategy/regional summaries.
  centersPage(), centerDialog()  Infrastructure input workflow.
  workloadsPage()                Generation/import and task exploration.
  schedulerPage()                Weights and policy configuration.
  experimentsPage()              Saved local experiments.
  methodologyPage()              In-app model explanation.
  renderTaskTable()              Strategy/search/status/pagination results.
  run()                         Validate, snapshot, execute, save, render.
  download(), downloadExperiment(), exportDialog() Output downloads.

Delegated click/change/submit handlers connect these functions. JSON hash
routes select pages without requesting a new backend page. There is no
React/Vue build system or npm frontend bundling step in this version.

dist/ui.js observes rendered interface changes and adds presentation and
accessibility behavior. adaptChartGeometry() reflows SVG geometry;
syncNavigation() manages mobile navigation state and focus; other helpers
enhance tables, tooltips, dialog dismissal, and keyboard behavior. This
module does not read/write scenario inputs, results, storage, or APIs.

dist/styles.css supplies tokens, typography, layout, components, responsive
rules, motion preferences, and print presentation. dist/favicon.svg and
dist/fonts/ provide bundled visual assets; OFL.txt is the font license.

10.3 Shared simulation implementation

dist/engine.js provides the actual numerical behavior:

  defaults()          Default center specifications and settings.
  rng()               Internal deterministic pseudo-random generator.
  generateTasks()     Build synthetic tasks from generator settings.
  validateScenario()  Shape, numeric, range, identity, and relationship checks.
  conditions()        Conditions active at a simulated time.
  integrate()         Piecewise energy/carbon/cost/renewable calculation.
  earliestSlot()      Earliest host interval with CPU and RAM capacity.
  runAlgorithm()      Candidate creation, policy, selection, booking, accounting.
  runExperiment()     Run all three strategies and package their results.
  parseCSV(), toCSV()  Shared tabular input/output helpers.
  clone()             JSON deep-copy helper for plain scenario/result data.

ALGORITHMS, LABELS, and COLORS keep strategy identifiers and presentation
consistent. No network calls or AWS SDK appear in the scheduling engine.

dist/worker.js is the browser execution adapter. It receives a scenario,
calls runExperiment(), and posts either a result or error back to app.js.

10.4 Node-to-Java boundary

server/cloudsim.mjs locates the project and executable JAR.
cloudsimAvailable() checks for that file. replayExperiment() spawns Java,
writes scenario/plan JSON, bounds execution/output, collects diagnostics,
parses the JSON result, and resolves/rejects the replay request.

cloudsim/src/main/java/research/verdant/Replay.java contains Replay.main(),
the Java entry point. It creates hosts with the configured cores/MIPS/RAM,
data centers, brokers pinned to their region, and one VM per planned host.
VM cloudlets use a space-shared CPU scheduler and explicit VM binding.

For each non-rejected carbon-plan task whose start is before the horizon,
it creates a cloudlet, sets per-core length to max(1, round(total MI/cores)),
uses full CPU utilization, applies planned submission delay, and binds the
planned VM. RAM utilization is represented as a task-to-VM fraction; the
reference model remains responsible for RAM admission. Network traffic is
not modeled as the application's latency; cloudlet bandwidth utilization
is zero and file/output sizes are placeholder one-byte values.

Java terminates around the requested horizon and reports task status/timing.
It counts CPU completions only if their finish is within the horizon. Final
event-clock overshoot is possible. Response-latency completion in Java and
the reference model can therefore differ, even if the sample counts agree.
Timing deviation is averaged over tasks completed within the horizon. When
none qualify, the replay's numeric mean is zero by implementation; do not
interpret that sentinel as proof of perfect timing agreement.

cloudsim/pom.xml specifies CloudSim Plus, Gson, Java compatibility, compiler,
and shaded executable packaging. logback.xml disables simulator logging so
stdout can contain machine-readable result JSON.

scripts/build-cloudsim.mjs downloads project-local Maven 3.9.11 when needed,
checks its SHA-512 against the downloaded checksum, extracts it, and runs
Maven packaging. Java compilation requires a JDK. The resulting runtime
artifact is cloudsim/target/cloudsim-replay.jar. .tools/ is build tooling,
not part of the scheduling architecture.

10.5 Reporting and evidence

scripts/export-results.mjs is the report entry point. It reads scenario JSON,
calls the shared engine, writes unit-explicit datasets, invokes optional
replay, and creates metadata plus a result-specific explanation. It takes
scenario and output-directory positional arguments.

scripts/plot-results.py is the figure entry point. arguments() resolves CLI
options; read_csv(), number(), and load_inputs() validate the datasets;
Graphs methods produce comparison, regional, timeline, and replay figures;
main() coordinates checksums, output manifests, plotting backend, and saving.

scripts/requirements-plots.txt declares Matplotlib >=3.7 and <4. CSV parsing,
hashing, paths, and argument processing use Python's standard library.
Without --show, the script uses a noninteractive backend and saves files.

samples/scenario.json is the retained complete sample input. The files under
results/sample/ and graphs_from_csv/ are final evidence artifacts, not code
that the server must load to calculate an experiment.

10.6 Packaging, monitoring, and load-test configuration

Dockerfile builds the Java JAR in a Maven/Java 21 stage and copies it into
a Node 22 image with Java 17 runtime. It copies the dashboard and Node source,
runs as the node user, exposes port 3000, and defines an HTTP health check.
Results and Python plotting are not bundled into that runtime image.

compose.yaml connects app, Prometheus, and Grafana, with persistent volumes
for monitoring data. Host bindings are loopback-only on ports 3000, 9090,
and 3001 respectively. Grafana credentials come from the configured default
or environment override; this is a local demonstration setup.

monitoring/prometheus.yml selects the scrape target and interval. Grafana
provisioning config selects Prometheus and loads dashboards/verdant.json
into the Research folder. That dashboard has twelve modeled/service panels.

load-tests/verdant.jmx defines an API POST load plan. Defaults are two users,
five iterations per user, a ten-second ramp-up, one-second think time,
five-second connect timeout, and ninety-second response timeout. Scenario,
host, port, users, and loops are parameterized. HTTP 200 is asserted; it
does not assert optimal placement or validate carbon accounting. Higher
concurrency can receive the server's intentional 429 admission response.

docs/EC2.md explains deployment of the simulator and monitoring stack to an
EC2 host, including loopback access through SSH tunnels. It is deployment
guidance, not an AWS resource provisioner. .dockerignore and .gitignore
exclude local tools, caches, secrets, and selected outputs from packaging
or version control. Local cache remnants are not additional runtime modules.


11. DESIGN DECISIONS, ALTERNATIVES, AND LIMITATIONS
==========================================================================

The benefits below explain the observable implementation choices. They
are architectural reasoning, not a claim that undocumented historical
design meetings or performance studies occurred.

11.1 One shared engine with separate interface and execution adapters

Why this approach is useful: browser-only execution, API execution, and CLI
reporting use the same calculations, reducing accidental formula drift.
The UI, HTTP code, and reporting remain separate from core decision logic.

An alternative is independent frontend/backend schedulers or a backend-only
service. Independent implementations can diverge; backend-only execution
loses the current static browser-worker mode. The current shared approach
still needs version-consistent deployment and suitable validation.

11.2 Explicit heuristic rather than a learned or global optimizer

Why useful: scores, eligibility, and reasons are explainable in a classroom
or project evaluation. Weights make preferences visible. The implementation
can compare straightforward baselines using identical scenario assumptions.

Alternatives include integer optimization, search-based scheduling,
reinforcement learning, or predictive temporal scheduling. They could
explore broader solution spaces but introduce solver/training requirements
and different validation needs. None is implemented here. Current scores
provide a local decision; they are not a proof of minimum fleet emissions.

11.3 Hard service constraints before environmental preference

Why useful: sending a latency-sensitive job to a clean but ineligible
location would not satisfy the defined application requirements. Filtering
first gives service constraints an explicit role. Deadline fallback is a
separate, visible policy rather than a hidden consequence of the score.

The remaining limit is that configured per-center latency is simplistic.
There is no task-origin latency matrix, network congestion, transfer-size
model, or measured end-to-end application response.

11.4 Linear power and all-host idle accounting

Why useful: this is a transparent operational electricity model that includes
baseline power and facility overhead instead of counting only busy jobs.
It supports exact integration of stepwise profiles and CPU reservations.

Alternatives include measured hardware curves, DVFS models, sleep states,
or explicit cooling/storage/network models. The current model does not
calibrate its watt values against real machines and never powers idle hosts
down. RAM allocation affects feasibility but not modeled power directly.

The candidate proxy also differs from incremental facility power. A future
objective based on marginal fleet emissions could make different choices.

11.5 Optional replay rather than replacing the entire engine

Why useful: the app remains usable with Node/browser JavaScript alone, while
Java adds independently implemented CPU event timing. Failures on the server
can retain the reference result and clearly indicate missing replay.

An alternative would implement carbon decisions and accounting directly in
CloudSim with custom scheduling policies. This version does not do that.
The replay checks one plan's timing, not all three strategies or physical
environmental accuracy. Per-core rounding and event delays also prevent
expecting exact equality for every task.

11.6 Local history and file exports rather than a database

Why useful: a single researcher can operate the application with few setup
requirements and retain inspectable, portable result files.

Limitations: history is browser-local and capped; storage can fail; there is
no cross-device synchronization, experiment ownership, audit database, or
multi-user access control. Server metrics retain only the latest experiment
and process-local counters. Database-backed research management is future work.

11.7 Separate simulation time, service time, and report generation

Why useful: the design distinguishes job response, API processing duration,
CloudSim event time, and graph generation. Each answers a different question.
This avoids interpreting a fast HTTP request as a fast simulated cloud job.

Limits: no end-to-end physical cloud performance benchmark, live carbon
measurement, JMeter results dataset, or measured deployment scaling is
included in the canonical sample experiment.

11.8 Production-readiness boundary

The application contains validation, bounded requests/replay, error handling,
static-path protections, local assets, and responsive/accessibility features.
These support a maintainable research demonstration. They do not constitute
a production distributed scheduler. Public hosting would need authentication,
authorization, transport/deployment hardening, durable job management,
isolation, operational testing, and additional abuse/resource controls.


12. PROJECT LIFECYCLE AND VALIDATION
==========================================================================

12.1 Lifecycle tied to the actual deliverables

  Motivation and problem identification
      |
      v
  Requirements: environmental + performance + capacity metrics
      |
      v
  Scenario design: centers, tasks, profiles, horizon, policy, weights
      |
      v
  Architecture: shared reference engine + dashboard/API + optional replay
      |
      v
  Implementation: decisions, reservations, accounting, interface, exports
      |
      v
  Execution: load or create scenario; evaluate three strategies
      |
      v
  Processing: placements -> bookings -> energy/resource integration
      |
      v
  Results: task records, regional totals, aggregate metrics, timelines
      |
      v
  Evidence: Java timing replay + saved CSV/JSON + CSV-driven figures
      |
      v
  Validation and interpretation -> refine scenario/design in another run

Problem identification is reflected in the environmental-versus-service
tradeoff. Requirement analysis appears in the input schema and eleven
requested metric categories. Design appears in the split between shared
numerical logic, execution adapters, and reporting. Implementation is the
source mapping in Section 10. Result generation is observable in the saved
sample dataset and its graph artifacts.

This describes the logical lifecycle supported by the project. It does not
invent a dated development history, formal user study, or cloud deployment
validation that the current files do not establish.

12.2 What validation exists in the current implementation

Input validation prevents many impossible or malformed scenarios before
execution. Browser and API boundaries both perform checks, while the engine
also validates direct programmatic calls.

Resource feasibility is enforced by booking interval checks. Reporting
checks task-status totals, numeric validity, percentages, and dataset labels.
The shared engine allows numerical reproduction from saved scenario input.
Input snapshots/hashes and plot manifests make the evidence traceable.

CloudSim replay supplies a separate CPU timing comparison. The verified
one-task walkthrough provides a hand-checkable example of time, score,
power, and metric calculations against executable output.

The current package.json has no test script, and the former automated test
sources are not part of the retained runnable source. Do not claim that
npm test works or that a comprehensive automated regression suite is
included. Restoring such a suite is an appropriate future improvement.

12.3 Useful checks when evaluating a new scenario

  - Confirm completed + running + queued + rejected = submitted per strategy.
  - Check no overlapping bookings exceed host CPU or RAM capacity.
  - Check resource/latency-ineligible centers never receive admitted tasks.
  - Confirm facility totals equal sums of regional facility totals.
  - Confirm final cumulative timeline totals match aggregate energy/carbon
    and completed counts, allowing floating-point tolerance.
  - Verify mean/P95 use only completed tasks and SLA uses all submissions.
  - Verify task-footprint totals are not substituted for facility totals.
  - Re-run an identical scenario to compare numerical metrics, ignoring
    experiment IDs/timestamps.
  - Inspect replay deviations as CPU timing checks, not emission validation.
  - Compare emissions with useful work, horizon, and SLA before conclusions.

These are evaluation procedures and invariants, not a claim that every one
is currently encoded as an automated test. Multiple seeds, loads, and
profiles are necessary for broader research conclusions than one sample.

12.4 Evidence checked while preparing this guide

The documentation was grounded in the application/runtime source, Java
replay/build configuration, input sample, saved CSV/JSON data, Python plot
pipeline, monitoring/deployment configuration, and load-test plan.
The one-task reference example and Java replay in Section 7 were executed
successfully. The saved sample comparison values were read from its CSV.
Docker stack execution, EC2 deployment, and JMeter performance results
were not established by this documentation exercise.


13. CURRENT STATUS AND FUTURE IMPROVEMENTS
==========================================================================

13.1 Implemented now

  - Configurable data centers with per-host CPU/RAM/MIPS/power and regional
    PUE, carbon, renewable, price, and latency inputs.
  - Synthetic seeded workloads, CSV imports, and scenario JSON import/export.
  - Optional stepwise regional energy-condition profiles.
  - Three independent constraint-aware scheduling strategies.
  - CPU/RAM booking calendars and finite-horizon task status accounting.
  - Operational facility energy/carbon/electricity-cost integration.
  - All requested metric categories with explicit denominators and units.
  - Responsive dashboard, comparative timelines, task inspection, local history.
  - Node API and browser-worker execution using the same engine.
  - Optional carbon-plan CloudSim Plus CPU timing replay.
  - Unit-explicit CLI report datasets and CSV-driven Python figures.
  - Docker/monitoring configuration, JMeter plan, and EC2 deployment guide.

13.2 Main limitations to acknowledge in a report

The application operates on scenario assumptions and simulated work. It
lacks live grid measurements, actual regional job dispatch, measured power
calibration, a true cloud control plane, forecasting, task migration,
preemption, failures/retries, and renewable supply capacity limits.

The heuristic considers the earliest feasible host slot rather than global
placement or intentional clean-energy delay. It uses a task power proxy
for candidate scoring, while facility totals include all idle power. A
finite horizon produces differing completion counts. The reported sample
is one seed/scenario, without statistical replication.

The interface does not persist a shared experiment database. API execution
has bounded admission, but synchronous computation and a subprocess replay
are not a scalable distributed job-service architecture. Current automated
regression test sources are absent from the retained project.

13.3 Proposed enhancements, clearly not current features

  1. Connect a documented live or archived grid dataset, preserving source,
     timestamp, region mapping, and uncertainty rather than assuming values.
  2. Add real task-origin latency matrices and transfer/network energy costs.
  3. Compare marginal-facility-carbon scoring with the current task proxy.
  4. Evaluate deliberate time shifting with forecasts and delay budgets.
  5. Add calibrated nonlinear power curves, sleep states, and richer RAM,
     storage, network, and cooling models.
  6. Replay every strategy in CloudSim, or implement the actual scheduler
     natively there, and explain differences from the reference model.
  7. Run multi-seed/multi-load experiments with confidence intervals and
     useful-work-normalized emissions; include sensitivity to weights/PUE.
  8. Restore focused automated tests for slot feasibility, profile boundaries,
     metrics, APIs, replay failure paths, and browser workflows.
  9. Add durable experiment storage, users, background jobs, and safe public
     deployment controls if the application becomes a shared service.
 10. Add real cloud job adapters only with explicit accounts, budgets,
     monitoring, and a defined separation between simulation and deployment.

Each proposal extends the research/application boundary. None should be
described in an evaluation as already implemented.


14. EVALUATION QUESTIONS WITH IMPLEMENTATION-GROUNDED ANSWERS
==========================================================================

Q1. What is the project in one sentence?
A. An interactive simulator comparing carbon-aware, round-robin, and
performance-first placement of resource- and latency-constrained workloads
across modeled data centers, with explainable metrics and report outputs.

Q2. What makes the scheduler carbon-aware?
A. It integrates a candidate's estimated electricity over its execution
interval, multiplies by the applicable carbon intensity, normalizes that
carbon objective with cost and response, and chooses the lowest weighted
score after feasibility/deadline handling.

Q3. Does the project directly schedule real AWS tasks?
A. No. Region names describe modeled locations. EC2 documentation supports
hosting the simulator, not provisioning and dispatching real regional work.

Q4. Is CloudSim Plus implementing the carbon-aware scheduling algorithm?
A. No. dist/engine.js chooses placements and computes environmental metrics.
Java replays the chosen carbon plan to compare CPU start/finish timing.

Q5. Why normalize the three objectives?
A. Grams, dollars, and seconds have different numeric scales. Min-max
normalization makes each a relative 0-1 quantity for the current candidate
set before the user weights determine its influence.

Q6. Is renewable percentage a fourth optimization objective?
A. No. It supports renewable energy and renewable-rich task metrics. The
implemented weighted score contains carbon, electricity cost, and response.

Q7. Does 92% renewable mean a task runs exclusively on renewable power?
A. No. The model attributes a share of consumed electricity according to
the input mix. A completed task meeting the configured threshold counts
as renewable-rich; that is a classification, not an exclusive supply proof.

Q8. What if the greenest center cannot meet maximum latency?
A. It is removed before scoring. The queue policy does not relax latency
or individual host resource constraints.

Q9. What if no location can meet the deadline?
A. Queue can retain an eligible plan marked deadlineFallback=true. Reject
creates a rejected task without a booking. If there is no resource/network
eligible host, rejection occurs under either policy.

Q10. Can a task be completed but fail the SLA?
A. Yes. It can return within the observation horizon but later than its
relative deadline. SLA's denominator is all submitted tasks, whereas mean
response includes all completed tasks, including completed overdue tasks.

Q11. How are overlapping tasks handled?
A. Each host stores start/end/core/RAM bookings. earliestSlot checks CPU and
RAM through proposed intervals, including internal booking start points.
Concurrent work is admitted only when both capacities remain satisfied.

Q12. Why do task emissions not sum to the dashboard carbon total?
A. Task attribution uses full-load power times core share during execution.
The dashboard facility total includes idle power on all enabled hosts for
the full horizon plus the dynamic increment from booked work and PUE.

Q13. Why is PUE included?
A. IT equipment electricity alone omits facility overhead. Multiplying IT
energy by configured PUE includes modeled cooling and supporting electricity.
The PUE values are scenario assumptions, not measurements produced here.

Q14. Is the algorithm globally optimal?
A. No. It is a greedy heuristic in arrival/ID order. It compares earliest
host slots per task and does not revise earlier placements or solve a
joint global optimization problem.

Q15. Are profile inputs forecasts or real-time API observations?
A. Neither automatically. They are user-supplied stepwise observations.
The engine applies their values from the specified times, without fetching
data, interpolating, or training a prediction model.

Q16. Why use three strategies?
A. Round-robin supplies a simple rotation baseline, performance-first favors
modeled response, and carbon-aware exposes environmental/service tradeoffs.
All three use the same input and hard feasibility/deadline-preference rules.

Q17. What does the 17.513% carbon reduction establish?
A. A lower simulated operational carbon total versus round-robin for the
saved 144-task, 900-second scenario. Carbon-aware completes six fewer tasks,
so the percentage is not proof of equal completed work at lower emissions
or of a universal production improvement.

Q18. What exactly does CloudSim timing deviation compare?
A. The absolute difference between planned CPU finish and CloudSim CPU
finish for completed-within-horizon replay tasks, averaged over those tasks.
It excludes the application's configured network-latency response term.

Q19. Why might replay finish times differ?
A. CloudSim models event and VM setup timing, and total task work is rounded
to integer per-core MI for cloudlets. Its event behavior differs from direct
reference formulas. Small deviations do not validate the power model.

Q20. Why can the CloudSim final clock exceed the requested horizon?
A. Its event loop may process termination-related events beyond that time.
The replay explicitly filters completion counts by the requested horizon
instead of interpreting the final event clock as the observation cutoff.

Q21. What does Grafana time represent?
A. Prometheus scrape time. Outcome gauges hold the latest server experiment's
modeled totals, while request/error/duration counters describe the real API.
Use time_series.csv for progression inside the simulated workload horizon.

Q22. What does JMeter validate here?
A. The included plan can measure API behavior while posting scenarios and
asserting HTTP 200. It does not validate environmental science, task SLA
formulas, or actual cloud workload execution. No canonical JMeter run
results are included in the saved simulation sample.

Q23. Can the application work without Java?
A. The reference simulation can run with Node or in a browser worker.
Replay requires Java and the JAR. On the server, missing JAR skips replay;
an attempted replay failure is reported while retaining reference results.

Q24. Can Python generate the figures without rerunning the experiment?
A. Yes. plot-results.py reads the saved unit-explicit CLI report CSVs,
calculates plot values from them, saves images, and verifies input checksums.
It does not require metadata.json or execute the JavaScript scheduler.

Q25. Is there machine learning, or a database?
A. Neither is implemented. The scheduler uses explicit rules and formulas.
History is localStorage; report evidence is CSV/JSON on disk.

Q26. How would you strengthen this research next?
A. Restore automated correctness checks; calibrate power and latency inputs;
use documented grid profiles; evaluate multiple seeds and load levels;
compare completed useful work and confidence intervals; then investigate
marginal facility emissions and intentional time shifting.


15. TECHNICAL VOCABULARY AND KEY TAKEAWAYS
==========================================================================

Cloud computing: computing resources provided through an infrastructure
service. This project models placement within such infrastructure.

Scheduler: logic assigning tasks to resources and execution intervals.
Scenario: complete input description of infrastructure, tasks, and policies.
Host: modeled server with per-host core and RAM capacities.
VM: virtual machine; in replay, one host-sized VM represents each logical host.
Cloudlet: CloudSim's modeled unit of task execution.
Broker: CloudSim component submitting/managing VMs and cloudlets.
Discrete-event simulation: advancing simulated time through scheduled events.
MI / MIPS: million instructions / million instructions per second.
Reservation: CPU/RAM capacity occupied over a planned time interval.
Horizon: finite simulated observation period, not real runtime duration.
Latency: configured network delay, in milliseconds.
Response time: waiting + CPU execution + configured latency seconds.
Deadline: allowed response time relative to task arrival.
QoS: quality of service, represented here by latency, response, completion,
and deadline/SLA-related results.
SLA: service-level agreement; the implemented pass rule is defined in Section 6.
W / kWh: power in watts / energy in kilowatt-hours.
PUE: facility electricity divided by IT electricity.
gCO2e: grams of carbon-dioxide equivalent, an emissions unit.
Carbon intensity: emissions attributed per kWh of electricity.
Renewable share: input fraction of supplied electricity classified renewable.
Heuristic: practical decision procedure without a global-optimum guarantee.
Normalization: mapping objectives onto a comparable relative numeric scale.
Greedy scheduling: deciding one task at a time without revisiting earlier choices.
Seed: value making pseudo-random task generation repeatable.
P95: nearest-rank 95th percentile of completed response times.
Throughput: completed work per unit of simulated time in this model.
Resource-seconds: resource quantity multiplied by occupied time.
API: HTTP interface used by the browser or load-testing client.
Worker: browser background execution context for the reference simulation.
Counter: cumulative service measurement since server start.
Gauge: value representing current/latest state, such as the latest experiment.
CSV: tabular text format used by spreadsheets and the reporting pipeline.
JSON: structured data format used for scenarios and complete experiments.
SHA-256: content hashing used for scenario/input traceability.

Key takeaways:

  - Placement is an environmental decision as well as a resource decision.
  - Hard resource/network limits and deadlines matter before scoring.
  - The carbon heuristic trades carbon, cost, and response using local,
    normalized candidate values rather than promising a universal optimum.
  - Facility totals include powered-on idle hosts and PUE overhead.
  - Completed tasks, SLA, renewable task share, and facility renewable share
    use different denominators and should not be substituted for each other.
  - Reference calculations, Java CPU replay, API monitoring, and actual
    cloud execution are different things; only the first three are supported
    in the described forms, and real AWS job execution is not implemented.
  - Report figures come from saved CSV measurements, with source manifests.
  - A defensible conclusion includes performance and useful-work tradeoffs
    alongside any reduction in modeled emissions.


16. SHORT EXECUTION REFERENCE
==========================================================================

This section is intentionally brief. The project's behavior is explained
above; these commands identify how to enter the existing workflows.
Run commands from carbon-aware-cloud/.

Open the application, with Node.js 20 or newer:

  npm start

Then open http://127.0.0.1:3000. No npm runtime packages are required by
the current application. Java is optional for reference-only execution.

Build the optional replay with an appropriate JDK available:

  npm run build:cloudsim

Generate report data from the retained sample scenario:

  npm run results:export

This writes results/sample/ and may overwrite its current named files.
To preserve those results while evaluating another run, choose a fresh
output directory instead:

  node scripts/export-results.mjs samples/scenario.json results/my-run

Prepare Python plotting dependencies when needed:

  python -m pip install -r scripts/requirements-plots.txt

Generate graphs from the existing sample CSVs, without running a simulation:

  python scripts/plot-results.py --input-dir results/sample

Or plot a separate exported run:

  python scripts/plot-results.py --input-dir results/my-run

By default, graphs are saved under that input directory's graphs_from_csv/.
Available options include --output-dir, --formats png pdf svg, --dpi
(72-600, default 180), and --show to open Matplotlib windows after saving.
npm run plots:generate invokes the same Python script with its defaults.

For the optional local container/monitoring stack, the provided entry is:

  docker compose up --build -d

The app is configured at 127.0.0.1:3000, Prometheus at 127.0.0.1:9090, and
Grafana at 127.0.0.1:3001. This is an execution instruction, not a claim
that the stack was run during documentation. Consult docs/EC2.md for the
separate EC2 deployment procedure and its actual scope.

End of teaching guide.
