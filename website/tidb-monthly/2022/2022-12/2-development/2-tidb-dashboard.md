---
title: TiDB集群安装TiDB Dashboard - TiDB 社区技术月刊
sidebar_label: TiDB集群安装TiDB Dashboard
hide_title: true
description: 本篇文章将介绍如何在 Kubernetes 环境下访问 TiDB Dashboard。
keywords: [TiDB, Kubernetes, Dashboard, 可视化面板]
---

# TiDB集群安装TiDB Dashboard

> 作者：[**lqbyz**](https://tidb.net/u/lqbyz/answer)

TiDB Dashboard 是从 TiDB 4.0 版本起引入的可视化面板，用于帮助观察与诊断整个 TiDB 集群，详情参见 [TiDB 文档 - TiDB Dashboard](https://docs.pingcap.com/zh/tidb/stable/dashboard-intro)。本篇文章将介绍如何在 Kubernetes 环境下访问 TiDB Dashboard。通过创建Dashboard能快速查看集群出现的问题，建议开启。

## 一、访问TiDB Dashboard

### 方法一、使用NodePort Service进行访问

#### 1.1、创建NodePort的Service

```SQL
[root@k8s-master tidb]# cat lqb-nodeport.yaml
apiVersion: v1
kind: Service
metadata:
  name: access-dashboard
  namespace: tidb ##替换实际的命名空间
spec:
  ports:
  - name: dashboard
    port: 10262
    protocol: TCP
    targetPort: 10262
  type: NodePort
  selector:
    app.kubernetes.io/component: discovery
    app.kubernetes.io/instance: yz  ####替换集群的名称
    app.kubernetes.io/name: tidb-cluster
```

#### 1.2、超过1个PD需要添加如下配置

```SQL
  pd:
    baseImage: pingcap/pd
    config: |
      [dashboard]
        internal-proxy = true
    replicas: 3
    requests:
      cpu: "100m"
      storage: 12Gi
    mountClusterClientSecret: false
    storageClassName: "local-storage-monitoring"
```

### 方法二、通过端口转发来方法

```Go
[root@k8s-master tidb]#  kubectl port-forward --address 0.0.0.0 svc/lqb-discovery 10262:10262 -ntidb
Forwarding from 0.0.0.0:10262 -> 10262

然后IP:10262/dashboard
http://172.16.5.194:10262/dashboard
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1670468091746.png)

### 方法三、通过ingress代理进行访问

```Go
[root@k8s-master tidb]# cat ingress-dashboard.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: lqb-yz-dashboard
  namespace: tidb
spec:
  rules:
    - host: "lqb.mytest.org"
      http:
        paths:
        - path: "/dashboard"
          pathType: Prefix
          backend:
            service:
              name: lqb-discovery
              port:
                number: 10262
```

当部署了 Ingress 后，你可以在 Kubernetes 集群外通过 http\://${host}/dashboard 访问 TiDB Dashboard。

## 二、启用持续性能分析(TidbNGMonitoring CR)

### 部署TidbNGMonitoring CR

```Go
[root@k8s-master tidb]# cat  tidbngmonitoring-yz.yaml
apiVersion: pingcap.com/v1alpha1
kind: TidbNGMonitoring
metadata:
  name: tidbngmonitoring-yz
  namespace: tidb
spec:
  clusters:
  - name: yz
    namespace: tidb
  configUpdateStrategy: RollingUpdate
  ngMonitoring:
    requests:
      storage: 10Gi
    version: v6.1.0
    storageClassName: local-storage
```

### 应用改配置文件

```Go
[root@k8s-master tidb]# kubectl apply -f tidbngmonitoring-yz.yaml
tidbngmonitoring.pingcap.com/tidbngmonitoring-yz created
```

### 启用持续性能分析

- 进入 TiDB Dashboard，选择高级调试 (Advanced Debugging) > 实例性能分析 (Profiling Instances) > 持续分析 (Continuous Profiling)。

- 点击打开设置 (Open Settings)。在右侧设置 (Settings) 页面，将启用特性 (Enable Feature) 下方的开关打开。设置保留时间 (Retention Period) 或保留默认值。

- 点击保存 (Save)。

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1670468092437.png)