---
title: TiDB Operator 升级 - TiDB 社区技术月刊
sidebar_label: TiDB Operator 升级
hide_title: true
description: 在使用 TiDB Operator 部署管理 Kubernetes 上的 TiDB 集群时，有时需要对 Operator进行升级，从而达到更稳定的管理 TiDB 集群的功能和扩展一些新功能。本文将对该种情况进行详细分析。
keywords: [TiDB, 数据仓库, TiCDC, 存储服务]
---

# TiDB Operator 升级

> 作者：[lqbyz](https://tidb.net/u/lqbyz/answer)

在使用TiDB Operator部署管理 Kubernetes 上的 TiDB 集群时，有时需要对Operator进行升级，从而达到更稳定的管理tidb集群的功能和扩展一些新功能。一般在升级TiDB Operator的时候有常规升级和灰度升级。如果希望升级TiDB Operator至新版本，同时控制**升级的影响范围**，避免对整个 Kubernetes 集群中的所有 TiDB 集群产生不可预知的影响，可以采用灰度升级的方式升级 TiDB Operator。使用灰度升级后，你可以在灰度部署的集群中确认 TiDB Operator 升级的影响，在确认 TiDB Operator 新版本稳定工作后，再常规升级TiDB Operator。

## 常规升级

常规升级指升级TiDB Operator到指定的版本，一般常用的方式有在线升级(可以连外网)和离线升级(不能连外网)。

### 在线升级

### 查看升级的TiDB Operator版本

```Bash
helm search repo -l tidb-operator
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438421.png)

如果输出中未包含你需要的版本则可以执行如下添加helm chart仓库，然后升级

```Bash
1、添加chart仓库
helm repo add pingcap https://charts.pingcap.org/
2、更新chart仓库
helm repo update
3、搜索提供的chart仓库
helm search repo pingcap
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438781.png)

### 更新 Kubernetes 的 CustomResourceDefinition (CRD)

**如果Kubernetes版本大于等于1.16**

- 如果 TiDB Operator 从 v1.3.x 升级到 v1.4.0 及以后版本，需要先执行下面命令创建新增加的 TidbDashboard CRD。如果是 v1.4.0 及以后版本的 TiDB Operator 升级，可跳过这一步

```Bash
kubectl create -f https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd/v1/pingcap.com_tidbdashboards.yaml
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438219.png)

- 更新CRD

```Bash
kubectl replace -f https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd.yaml && \
kubectl get crd tidbclusters.pingcap.com
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438857.png)

**如果Kubernetes版本小于1.16**

- 如果 TiDB Operator 从 v1.3.x 升级到 v1.4.0 及以后版本，需要先执行下面命令创建新增加的 TidbDashboard CRD。如果是 v1.4.0 及以后版本的 TiDB Operator 升级，可跳过这一步。

```Bash
kubectl create -f https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd/v1beta1/pingcap.com_tidbdashboards.yaml
```

- 更新 CRD

```Bash
kubectl replace -f https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd_v1beta1.yaml && \
kubectl get crd tidbclusters.pingcap.com
```

### 创建升级的values-tidb-operator.yaml文件

```Bash
mkdir -p ${HOME}/tidb-operator/v1.4.0 && \
helm inspect values pingcap/tidb-operator --version=v1.4.0 > ${HOME}/tidb-operator/v1.4.0/values-tidb-operator.yaml
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438269.png)

旧版本 `values.yaml` 中设置了自定义配置，将自定义配置合并到 `${HOME}/tidb-operator/v1.4.0/values-tidb-operator.yaml` 中。

### 执行升级

```Bash
helm upgrade tidb-operator pingcap/tidb-operator --version=v1.4.0 -f ${HOME}/tidb-operator/v1.4.0/values-tidb-operator.yaml  -ntidb-admin
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438393.png)

如果不加namespaces的话会出现如下报错：**Error**: UPGRADE FAILED: "tidb-operator" has no deployed releases"

解决步骤如下：加上命名空间tidb-admin，如果不清楚命名空间可以通过如下进行查询。

```Bash
[root@k8s-master ~]# helm list -A
NAME                   NAMESPACE            REVISION        UPDATED                                        STATUS          CHART                        APP VERSION
6                      tidb                 1               2022-12-02 14:48:48.917604258 +0800 CST        failed          tidb-lightning-v1.3.9
6.1.0                  tidb                 1               2022-12-02 12:25:10.149345501 +0800 CST        failed          tidb-lightning-v1.3.9
chaos-mesh             chaos-testing        2               2022-06-09 16:51:49.542186958 +0800 CST        deployed        chaos-mesh-2.1.4             2.1.4
lightning              tidb                 1               2022-12-02 14:49:21.495945953 +0800 CST        deployed        tidb-lightning-v1.3.9
tidb-operator          tidb-admin           10              2023-01-10 13:50:24.288162887 +0800 CST        deployed        tidb-operator-v1.4.0         v1.4.0
v1.3                   tidb                 1               2022-12-02 12:26:32.639264502 +0800 CST        failed          tidb-lightning-v1.3.9
v6.1.0                 tidb                 1               2022-12-02 12:24:46.04948406 +0800 CST         failed          tidb-lightning-v1.3.9
v6.1.0-20221130        tidb                 1               2022-12-02 12:32:32.747777196 +0800 CST        failed          tidb-lightning-v1.3.9

升级后加上命名空间就可以解决了
```

### pod全部正常启动后，查看确认TiDB Operator镜像版本

```Bash
kubectl get po -n tidb-admin -l app.kubernetes.io/instance=tidb-operator -o yaml | grep 'image:.*operator:'
```

如果输出类似下方的结果，则表示升级成功。其中，`v1.4.0` 表示已升级到的版本号。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438726.png)

TiDB Operator 升级之后，所有 TiDB 集群中的 `discovery` Deployment 都会自动升级到对应的 TiDB Operator 版本。

## 离线升级

### 下载升级所需的文件和镜像

**下载所需的CRD.yaml文件**

- 如果Kubernetes版本大于1.16

```Bash
wget -O crd.yaml https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd.yaml
```

- 如果Kubernetes版本小于1.16

```Bash
wget -O crd.yaml https://raw.githubusercontent.com/pingcap/tidb-operator/${operator_version}/manifests/crd_v1beta1.yaml
```

**下载tidb-operator chart包文件**

```Bash
wget http://charts.pingcap.org/tidb-operator-v1.4.0.tgz
```

**下载所需的镜像文件**

```Bash
docker pull pingcap/tidb-operator:v1.4.0
docker pull pingcap/tidb-backup-manager:v1.4.0

docker save -o tidb-operator-v1.4.0.tar pingcap/tidb-operator:v1.4.0
docker save -o tidb-backup-manager-v1.4.0.tar pingcap/tidb-backup-manager:v1.4.0
```

### 将下载文件和镜像上传到私有仓库和升级的operator服务器上，依次执行

```Bash
1、升级 TiDB Operator 需要的 crd.yaml 文件：
kubectl replace -f ./crd.yaml
2、解压 tidb-operator chart 包文件，并拷贝 values.yaml 文件到升级目录：
tar zxvf tidb-operator-v1.4.0.tgz && \
mkdir -p ${HOME}/tidb-operator/v1.4.0 && \
cp tidb-operator/values.yaml ${HOME}/tidb-operator/v1.4.0/values-tidb-operator.yaml
```

### 修改values.yaml中operatorImage镜像版本为升级的版本

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438278.png)

### 执行升级命令

```Bash
helm upgrade tidb-operator ./tidb-operator --version=v1.4.0 -f ${HOME}/tidb-operator/v1.4.0/values.yaml  -n tidb-admin
```

### pod全部启动后，运行如下命令确认TiDB Operator镜像版本

```Bash
kubectl get po -n tidb-admin -l app.kubernetes.io/instance=tidb-operator -o yaml | grep 'image:.*operator:'
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438257.png)

## 灰度升级

TiDB Operator 目前只支持对部分组件进行灰度升级，即 [tidb-controller-manager](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/architecture) 和 [tidb-scheduler](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/tidb-scheduler)，不支持对[增强型 StatefulSet 控制器](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/advanced-statefulset)和[准入控制器](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/enable-admission-webhook)进行灰度升级。

在使用 TiDB Operator 时，`tidb-scheduler` 并不是必须使用。你可以参考 [tidb-scheduler 与 default-scheduler](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/tidb-scheduler#tidb-scheduler-%E4%B8%8E-default-scheduler)，确认是否需要部署 `tidb-scheduler`。

### 为当前TiDB Operator配置selector并进行升级

在当前的tidb operator的values-tidb-operator.yaml中添加如下selector配置

```Bash
controllerManager:
  selector:
  - version!=canary
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438787.png)

对当前tidb operator执行升级步骤

```Bash
helm upgrade tidb-operator pingcap/tidb-operator --version=${chart_version} -f ${HOME}/tidb-operator/values-tidb-operator.yaml -ntidb-admin
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438362.png)

### 部署灰度的TiDB Operator

在values-tidb-operator.yaml中添加`appendReleaseSuffix` 需要设置为 `true`。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1673337438818.png)

在不同的namespaces中部署灰度的tidb operator

```Bash
helm install tidb-operator-canary pingcap/tidb-operator --namespace=tidb-admin-canary --version=${operator_version} -f ${HOME}/tidb-operator/${operator_version}/values-tidb-operator.yaml
```

将 `${operator_version}` 替换为你需要灰度升级到的 TiDB Operator 版本号。

### 正常升级tidb operator

确认灰度部署的 TiDB Operator 已经正常工作后，可以正常升级 TiDB Operator。

**删除灰度部署的TiDB Operator**

```Bash
helm -n tidb-admin-canary uninstall ${release_name}
```

**正常升级TiDB Operator，采用常规升级即可**