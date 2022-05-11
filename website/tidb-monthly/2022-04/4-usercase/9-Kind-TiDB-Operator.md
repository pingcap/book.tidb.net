---
title: 本地 Kind 体验 TiDB Operator 最小实践
hide_title: true
---

# 本地 Kind 体验 TiDB Operator 最小实践

**作者：[边城元元](https://tidb.net/u/%E8%BE%B9%E5%9F%8E%E5%85%83%E5%85%83/answer)**


## 一、背景

本地 TiDB 测试环境（基于 k8s）按照说明文档操作了几次都没有成功安装 TiDB 集群，对我这样的新新手还是有些难度，今天把部署成功的路径记录下来！

## 二、准备环境

> 系统：基于 centos7.3 pure的虚拟机 配置：2c,4G IP：192.168.31.236 （虚拟机IP ） k8s:kind本地模拟k8s集群 TiDB:v5.4.0

### 2.1 使用 kind 创建 Kubernetes 集群

> ```
> 目前比较通用的方式是使用 [kind](https://kind.sigs.k8s.io/) 部署本地测试 Kubernetes 集群。kind 适用于使用 Docker 容器作为集群节点运行本地 Kubernetes 集群。
> ```

#### 2.1.1 部署前准备环境

请确保满足以下要求

- [docker](https://docs.docker.com/install/)：版本 >= 17.03
- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)：版本 >= 1.12
- [kind](https://kind.sigs.k8s.io/)：版本 >= 0.8.0
- 若使用 Linux, [net.ipv4.ip_forward](https://linuxconfig.org/how-to-turn-on-off-ip-forwarding-in-linux) 需要被设置为 `1`

```shell
# 1、安装docker
yum remove docker  docker-common docker-selinux docker-engine
yum install -y yum-utils device-mapper-persistent-data lvm2
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum install docker-ce

# # 开机启动  
systemctl start docker
systemctl enable docker
# # 查看版本
docker version

[root@tidb-k3s .kube]# docker version
Client: Docker Engine - Community
 Version:           20.10.14
 API version:       1.41
 Go version:        go1.16.15
# # 安装docker-compose指定版本2.2.2
curl -L "https://github.com/docker/compose/releases/download/v2.2.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose 
docker-compose --version

[root@tidb-k3s .kube]# docker-compose --version
Docker Compose version v2.2.2
# 2、安装kubectl
curl -L "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl
chmod +x /usr/local/bin/kubectl

[root@tidb-k3s .kube]# kubectl version
Client Version: version.Info{Major:"1", Minor:"23", GitVersion:"v1.23.5", GitCommit:"c285e781331a3785a7f436042c65c5641ce8a9e9", GitTreeState:"clean", BuildDate:"2022-03-16T15:58:47Z", GoVersion:"go1.17.8", Compiler:"gc", Platform:"linux/amd64"}
# 3、安装kind v0.12.0版本
curl -L "https://github.com/kubernetes-sigs/kind/releases/download/v0.12.0/kind-linux-amd64" -o /usr/local/bin/kind && chmod +x /usr/local/bin/kind

[root@tidb-k3s .kube]# kind version
kind v0.12.0 go1.17.8 linux/amd64
# 4、设置net.ipv4.ip_forward 为 1
vim /proc/sys/net/ipv4/ip_forward

cat /proc/sys/net/ipv4/ip_forward
1
```

#### 2.1.2 创建集群

> kind create cluster

这个过程有点慢（需要下载1个多G的镜像）

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302421608.png)

检查集群是否创建成功：

```shell
[root@tidb-k3s bin]# kubectl cluster-info
Kubernetes control plane is running at https://127.0.0.1:44141
CoreDNS is running at https://127.0.0.1:44141/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

Kubernetes 集群部署完成，现在就可以开始部署 TiDB Operator 了！

### 2.2 部署 TiDB Operator

#### 2.2.1 安装 TiDB Operator CRDs

1、raw.githubusercontent.com 国内不能直接访问，需要设置host

> https://ipaddress.com/website/raw.githubusercontent.com#通过这个链接查看服务器ip

```shell
vim /etc/hosts

185.199.108.133 raw.githubusercontent.com
185.199.109.133 raw.githubusercontent.com
185.199.110.133 raw.githubusercontent.com
185.199.111.133 raw.githubusercontent.com
```

2、安装 CRD 到集群中

```shell
# 下载crd.yaml
curl -L https://raw.githubusercontent.com/pingcap/tidb-operator/v1.3.2/manifests/crd.yaml -o crd.yaml
# 创建 crd
kubectl create -f crd.yaml
# 删除 crd
# kubectl delete  -f crd.yaml


# 查看crd
kubectl get crd

[root@tidb-k3s k8s]# kubectl get crd
NAME                                 CREATED AT
backups.pingcap.com                  2022-04-06T23:15:51Z
backupschedules.pingcap.com          2022-04-06T23:15:51Z
dmclusters.pingcap.com               2022-04-06T23:15:51Z
restores.pingcap.com                 2022-04-06T23:15:52Z
tidbclusterautoscalers.pingcap.com   2022-04-06T23:15:52Z
tidbclusters.pingcap.com             2022-04-06T23:15:54Z
tidbinitializers.pingcap.com         2022-04-06T23:15:58Z
tidbmonitors.pingcap.com             2022-04-06T23:15:59Z
tidbngmonitorings.pingcap.com        2022-04-06T23:16:01Z
```

#### 2.2.2 安装 TiDB Operator

##### 1、安装helm

```shell
# helm
curl -L https://get.helm.sh/helm-v3.8.0-linux-amd64.tar.gz -o helm-v3.8.0-linux-amd64.tar.gz
tar -zxvf helm-v3.8.0-linux-amd64.tar.gz
mv ./linux-amd64/helm /usr/local/bin/helm
chmod +x /usr/local/bin/helm

# helm version
[root@tidb-k3s k8s]# helm version
version.BuildInfo{Version:"v3.8.0", GitCommit:"d14138609b01886f544b2025f5000351c9eb092e", GitTreeState:"clean", GoVersion:"go1.17.5"}
```

##### 2、添加 PingCAP 仓库

```shell
helm repo add pingcap https://charts.pingcap.org/

#helm repo list
[root@tidb-k3s k8s]# helm repo list
NAME    URL                        
pingcap https://charts.pingcap.org/
```

##### 3、为 TiDB Operator 创建一个命名空间

```shell
kubectl create namespace tidb-admin
```

##### 4、安装 TiDB Operator

```shell
helm install --namespace tidb-admin tidb-operator pingcap/tidb-operator --version v1.3.2
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302439706.png)

**注意**：安装tidb-operator 如果出现下面的提示：

Error: INSTALLATION FAILED: cannot re-use a name that is still in use

```shell
# 重新创建namespace
helm ls --all-namespaces
kubectl delete namespace tidb-admin
kubectl create namespace tidb-admin
```

##### 5、检查 TiDB Operator 组件是否正常运行

```shell
watch  kubectl get pods --namespace tidb-admin -l app.kubernetes.io/instance=tidb-operator
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302450504.png)

当所有的 pods 都处于 Running 状态时，继续下一步部署tidb集群。

**注意**：如果所有的pod都一直处于pending，需要检查虚拟机的cpu和内存是不是够用 2核4G以上即可。

## 三、部署tidb cluster和监控

### 3.1 部署tidb-cluster集群

#### 3.1.1 下载tidb-cluster.yaml

```shell
# 下载tidb-cluster.yaml
curl -L https://raw.githubusercontent.com/pingcap/tidb-operator/master/examples/basic/tidb-cluster.yaml -o tidb-cluster-basic.yaml
```

#### 3.1.2 创建tidb集群命名空间

```shell
kubectl create namespace tidb-cluster
```

#### 3.1.3 部署tidb-cluster集群

```shell
# 使用上面下载的集群拓扑tidb-cluster-basic.yaml
kubectl -n tidb-cluster apply -f ./tidb-cluster-basic.yaml

# 立即提示 created
[root@tidb-k3s k8s]# kubectl -n tidb-cluster apply -f ./tidb-cluster-basic.yaml
tidbcluster.pingcap.com/basic created
```

#### 3.1.4 观察pod创建

```shell
# 观察pod创建
watch kubectl get pod -n tidb-cluster
```

##### 1、先创建discoery和pd

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302465963.png)

##### 2、创建完pd才开始创建tikv

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302474292.png)

##### 3、tikv创建完之后开始创建tidb-server

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302483186.png)

#### 3.1.5 对外暴露端口14000

```shell
# 获取 tidb-cluster 命名空间中的服务列表 4000端口是否准备完毕
kubectl get svc -n tidb-cluster

# 使用端口转发 监听0.0.0.0:14000  转发到tidb-server的4000
kubectl port-forward --address 0.0.0.0 -n tidb-cluster svc/basic-tidb 14000:4000 > pf14000.out &

# 查看监听端口
netstat -tpln

# 如果端口 14000 已经被占用，可以更换一个空闲端口。命令会在后台运行，并将输出转发到文件 pf14000.out。
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302492781.png)

#### 3.1.6 连接 TiDB-server

##### 1、使用mysql 客户端连接（其他client也可以）

```shell
# 此处的 192.168.31.236 为虚拟机的ip，如果要使用127.0.0.1可以设置本机端口转发到虚拟机
# 保留注释，以便使用hint
mysql --comments -h 192.168.31.236 -P 14000 -u root

#提示
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 179
Server version: 5.7.25-TiDB-v5.4.0 TiDB Server (Apache License 2.0) Community Edition, MySQL 5.7 compatible
mysql>
```

##### 2、使用测试sql

```shell
mysql> use test;
mysql> create table hello_world (id int unsigned not null auto_increment primary key, v varchar(32));

mysql> select * from information_schema.tikv_region_status where db_name=database() and table_name='hello_world'\G

# 查看版本号
mysql> select tidb_version()\G

# 查询 TiKV 存储状态
mysql> select * from information_schema.tikv_store_status\G

# 查看集群基本信息
mysql> select * from information_schema.cluster_info\G
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302505363.png)

### 3.2 部署监控

#### 3.2.1 下载tidb-monitor.yaml

```shell
curl -L https://raw.githubusercontent.com/pingcap/tidb-operator/master/examples/basic/tidb-monitor.yaml -o tidb-monitor-basic.yaml
```

#### 3.2.2 部署监控节点

```shell
kubectl -n tidb-cluster apply -f ./tidb-monitor-basic.yaml
```

#### 3.2.3 观察监控pod创建

```shell
watch kubectl get pod -n tidb-cluster
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302522822.png)

获取服务列表 kubectl get svc -n tidb-cluster

```shell
# 获取 tidb-cluster 命名空间中的服务列表 3
[root@tidb-k3s k8s]# kubectl get svc -n tidb-cluster
NAME                     TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)               AGE
basic-discovery          ClusterIP   10.96.206.145   <none>        10261/TCP,10262/TCP   61m
basic-grafana            ClusterIP   10.96.190.13    <none>        3000/TCP              22m
basic-monitor-reloader   ClusterIP   10.96.16.223    <none>        9089/TCP              22m
basic-pd                 ClusterIP   10.96.19.73     <none>        2379/TCP              61m
basic-pd-peer            ClusterIP   None            <none>        2380/TCP,2379/TCP     61m
basic-prometheus         ClusterIP   10.96.109.172   <none>        9090/TCP              22m
basic-tidb               ClusterIP   10.96.37.140    <none>        4000/TCP,10080/TCP    47m
basic-tidb-peer          ClusterIP   None            <none>        10080/TCP             47m
basic-tikv-peer          ClusterIP   None            <none>        20160/TCP             58m
```

#### 3.2.4 对外暴露端口2379，3000

```shell
kubectl port-forward --address 0.0.0.0 -n tidb-cluster svc/basic-grafana 3000:3000 > pf3000.out &
kubectl port-forward --address 0.0.0.0 -n tidb-cluster svc/basic-pd 2379:2379 > pf2379.out &

#注意：这里要加上 --address 0.0.0.0,否则 外网无法访问
```

#### 3.2.5 测试Dashboard

> http://192.168.31.236:2379/dashboard/ root=

##### 3.2.5.1 概况

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302553017.png)

##### 3.2.5.2 TopSql

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302562454.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302572605.png)

![img](C:\Users\Administrator\AppData\Roaming\Typora\typora-user-images\image-20220407085849850.png)

1、安装NgMonitoring

```shell
cat << EOF | kubectl apply -n tidb-cluster -f -
apiVersion: pingcap.com/v1alpha1
kind: TidbNGMonitoring
metadata:
  name: main-cluster-monitoring
spec:
  clusters:
  - name: basic
    namespace: tidb-cluster

  ngMonitoring:
    requests:
      storage: 1Gi
    version: v5.4.0
    # storageClassName: default
    baseImage: pingcap/ng-monitoring
	
EOF

# 提示
# tidbngmonitoring.pingcap.com/main-cluster-monitoring created
```

2、等待pod安装成功进入running状态

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302589648.png)

3、安装成功后 ，刷新dashboard。

> 1)、打开设置（topSQL） http://192.168.31.236:2379/dashboard/#/topsql

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302600561.png)

​                    ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302608115.png)

4、点击保存后，过几分钟 topsql将会有数据。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302639247.png)

#### 3.2.6 测试grafana

> http://192.168.31.236:3000/ admin=admin

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302649894.png)

## 四、扩容与缩容

> 1、进行扩容操作，可将某个组件的 `replicas` 值**调大**。扩容操作会按照 Pod 编号由小到大增加组件 Pod，直到 Pod 数量与 `replicas` 值相等。 2、进行缩容操作，可将某个组件的 `replicas` 值**调小**。缩容操作会按照 Pod 编号由大到小删除组件 Pod，直到 Pod 数量与 `replicas` 值相等。
>
> 3、查看集群水平扩缩容状态
>
> watch kubectl -n ${namespace} get pod -o wide
>
> 提示： 1、PD 和 TiDB 通常需要 10 到 30 秒左右的时间进行扩容或者缩容。 2、TiKV 组件由于涉及到数据搬迁，通常需要 3 到 5 分钟来进行扩容或者缩容。

> 

### 4.1 水平扩容 2个tidb，最终实现3个tidb

按需修改 TiDB 集群组件的 `replicas` 值。例如，执行以下命令可将 PD 的 `replicas` 值设置为 3：

```shell
# kubectl get tidbcluster ${cluster_name} -n ${namespace} -oyaml
# # 查看
kubectl get tidbcluster basic -n tidb-cluster -o yaml

# kubectl patch -n ${namespace} tc ${cluster_name} --type merge --patch '{"spec":{"pd":{"replicas":3}}}'
# 设置 replicas为3 （即扩容2个tidb）
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"tidb":{"replicas":3}}}'
```

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302664144.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302673052.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649302680287.png)

### 4.2 水平扩容2个pd，2个tikv 最终实现 333

```shell
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"pd":{"replicas":3}}}'
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"tikv":{"replicas":3}}}'

# 查看pod创建情况
kubectl get pod -n tidb-cluster

[root@tidb-k3s k8s]# kubectl get pod -n tidb-cluster 
NAME                                      READY   STATUS    RESTARTS        AGE
basic-discovery-55fd6db97f-k48xf          1/1     Running   0               147m
basic-monitor-0                           4/4     Running   0               108m
basic-pd-0                                1/1     Running   0               147m
basic-pd-1                                1/1     Running   2               15m
basic-pd-2                                1/1     Running   0               14m
basic-tidb-0                              2/2     Running   0               133m
basic-tidb-1                              2/2     Running   0               23m
basic-tidb-2                              2/2     Running   0               23m
basic-tikv-0                              1/1     Running   0               144m
basic-tikv-1                              1/1     Running   1 (3m12s ago)   12m
main-cluster-monitoring-ng-monitoring-0   1/1     Running   0               75m
```

我这里在创建basci-tikv-2的时候较慢（受限于内存和cpu）。

### 4.3 水平缩容 2个tidb、2个tikv,2个pd

```shell
# 缩容
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"pd":{"replicas":1}}}'
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"tikv":{"replicas":1}}}'
kubectl patch -n tidb-cluster tc basic --type merge --patch '{"spec":{"tidb":{"replicas":1}}}'

# 查看pod创建情况
watch kubectl get pod -n tidb-cluster
```

### 4.4 垂直扩缩容

> 通过增加或减少 Pod 的资源限制，来达到集群扩缩容的目的。 **垂直扩缩容本质上是 Pod 滚动升级的过程。**

**提示**：垂直扩缩容和扩缩容其他组件整理不做演示，请参考 https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/scale-a-tidb-cluster

## 五、升级集群

### 5.1 升级TiDB集群

5.1.1 在 TidbCluster CR 中，修改待升级集群的各组件的镜像配置：

```shell
# kubectl edit tc ${cluster_name} -n ${namespace}

kubectl edit tc basic -n tidb-cluster
#一般修改 `spec.version` 即可。
```

5.1.2 查看升级进度

```shell
watch kubectl -n tidb-cluster get pod -o wide
```

当所有 Pod 都重建完毕进入 `Running` 状态后，升级完成。

## 总结与思考

### 总结

1、安装完成不易，在此记录心路历程。感谢tidb官网、感谢tidber！

2、**TiDB Operator**的其他功能需要更多的探索学习！

### 思考

未来 ALL in TIdb，使用 k8s 还是裸机 tiup 的方式，这个疑问后续继续探索。