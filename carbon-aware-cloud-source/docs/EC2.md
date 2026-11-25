# Demonstrate Verdant on AWS EC2

The application can run on one EC2 instance with Docker Compose. It simulates multiple locations; it does not provision or schedule real compute across AWS regions. No AWS resources have been created by this project.

## Prepare an instance

Use an x86-64 Amazon Linux 2023 instance with enough memory for the Java build and the three services; 4 GB RAM is a practical starting point, not a measured minimum. Choose an existing VPC/subnet and an SSH key. Allow inbound SSH (22) only from your client IP. The included Compose file binds app/monitoring ports to the instance’s loopback address, so they do not need inbound rules.

Install Docker following [AWS’s EC2 Docker instructions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-container-image.html) and Compose using the [official Docker instructions](https://docs.docker.com/compose/install/linux/).

On Amazon Linux 2023, the Docker installation steps are:

```sh
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
```

Reconnect after group membership changes. Confirm `docker info` and `docker compose version` work before proceeding.

## Copy and launch

From a local terminal, copy the project source using SCP or your chosen private source repository. Exclude `.tools/`, `node_modules/`, `.git/`, `cloudsim/target/`, `.openai/`, test screenshots, and any environment files. The container build downloads and builds its own Java dependencies.

One option is a source archive created from a reviewed Git checkout:

```sh
git archive --format=tar.gz -o verdant-source.tar.gz HEAD
scp -i /path/to/key.pem verdant-source.tar.gz ec2-user@YOUR_INSTANCE_IP:~/
ssh -i /path/to/key.pem ec2-user@YOUR_INSTANCE_IP
mkdir -p ~/verdant
tar -xzf ~/verdant-source.tar.gz -C ~/verdant
cd ~/verdant
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/api/health
```

The Dockerfile uses Java 21 to build and Java 17 to run the Java-17-compatible replay JAR. Frontend and reference API require no npm runtime packages. Set a Grafana password in `.env` before the first launch if desired.

## Open a local tunnel

From your local computer:

```sh
ssh -i /path/to/key.pem -L 3000:127.0.0.1:3000 -L 3001:127.0.0.1:3001 -L 9090:127.0.0.1:9090 ec2-user@YOUR_INSTANCE_IP
```

Then open the app at http://127.0.0.1:3000 and Grafana at http://127.0.0.1:3001. If those local ports are occupied, change the first port in each `-L` argument and open the corresponding local port.

Run an experiment and confirm the dashboard under Grafana’s **Research** folder receives metrics. Retain JSON/CSV results for the report. Stop the stack with `docker compose down` when finished; persistent monitoring volumes remain. Stop or terminate the EC2 instance through your AWS account when it is no longer needed.

Public multi-user hosting, application authentication, shared database persistence, real grid-data integrations, and real AWS workload execution are outside this version’s scope.
