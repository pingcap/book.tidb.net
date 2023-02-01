---
title: Etcd API 未授权访问漏洞修复 - TiDB 社区技术月刊
sidebar_label: Etcd API 未授权访问漏洞修复 
hide_title: true
description: 本文将针对 etcd API 未授权访问漏洞的修复进行分析。
keywords: [TiDB , etcd API, 漏洞修复, 未授权]
---

# Etcd API 未授权访问漏洞修复

> 作者：[gary](https://tidb.net/u/gary/answer)

## 概述

针对etcd API 未授权访问漏洞

etcd是一个采用HTTP协议的健/值对存储系统，它是一个分布式和功能层次配置系统，可用于构建服务发现系统。用于共享配置和服务发现的分布式,一致性的KV存储系统.其很容易部署、安装和使用，提供了可靠的数据持久化特性。etcd提供了 API 访问的方式，但由于未配置认证，导致etcd API 存在未授权访问漏洞。

## 集群环境

此系统共使用物理机8个节点。

tidb版本：v4.0.12

|             |     |       |                                |
| ----------- | --- | ----- | ------------------------------ |
| IP          | Cpu | 内存(g) | 用途                             |
| xx.xx.xx.51 | 96  | 251   | 3个TIKV实例                       |
| xx.xx.xx.53 | 96  | 251   | 3个TIKV实例                       |
| xx.xx.xx.55 | 96  | 251   | 3个TIKV实例                       |
| xx.xx.xx.61 | 96  | 503   | 1个tidb,1个pd,1个pump             |
| xx.xx.xx.63 | 96  | 503   | 1个tidb,1个pd,1个pump             |
| xx.xx.xx.65 | 96  | 503   | 1个tidb,1个pd,1个pump             |
| xx.xx.xx.70 | 96  | 503   | 1个drainer（灾备端的）                |
| xx.xx.xx.75 | 96  | 251   | 1个drainer，监控，生产和灾备的中控机，存放备份的节点 |



## 方案建议

etcd的漏洞整改建议

方案一：配置身份验证, 防止止未经授权用用户访问

Tidb集群配置tls安全访问，需要先把pd节点由3节点缩容到1节点，这种方法对pd集群有一定风险，不太建议此方法。

方案二：访问控制策略略, 限制IP访问

开启操作系统iptabes，配置白名单，内部节点可访问pd节点。

此方案对集群的影响相对较小


## 方案二实施

TiDB集群中PD主机通过防火墙iptables设置白名单，PD之间互信，拒绝外来访问

1\) 检查(xx.xx.xx.61、xx.xx.xx.63、xx.xx.xx.65)机器上的端口情况，因为这3台机器上混部了pd、tidb、pump节点

tiup cluster display tidb-xxxx

 

2\) 确认pd leader节点

tiup ctl:v4.0.12 pd -u http\://xx.xx.xx.61:2379 member

tiup ctl:v4.0.12 pd -u http\://xx.xx.xx.61:2379 member leader show

 

3\) 先开启非pd leader两个节点的防火墙，再把pd leader进行切换

tiup ctl:v4.0.12 pd -u http\://xx.xx.xx.61:2379 member leader transfer pd\_pd2

 

## 可能造成的风险:

在切换pd leader可能短暂出现tikv找不到pd节点，导致事务被 block，会对业务造成一定风险，建议确认停止业务后进行操作



6\) 入以下规则


```
vi /etc/sysconfig/iptables

-A INPUT -s xx.xx.xx.51 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.53 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.55 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.61 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.63 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.65 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.70 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.75 -p tcp -m tcp --dport 2379 -j ACCEPT

-A INPUT -s xx.xx.xx.51 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.53 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.55 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.61 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.63 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.65 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.70 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.75 -p tcp -m tcp --dport 2380 -j ACCEPT

-A INPUT -s xx.xx.xx.51 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.53 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.55 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.61 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.63 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.65 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.70 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.75 -p tcp -m tcp --dport 8250 -j ACCEPT

-A INPUT -s xx.xx.xx.51 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.53 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.55 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.61 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.63 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.65 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.70 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -s xx.xx.xx.75 -p tcp -m tcp --dport 10080 -j ACCEPT

-A INPUT -p tcp --dport 4000 -j ACCEPT

```


7\) 打开iptables防火墙

systemctl start iptables



8\)检查防火墙策略(xx.xx.xx.61、xx.xx.xx.63、xx.xx.xx.65) ：

&#x20;iptables -L -n



9\) 集群验证：（节点状态是否正常）

tiup cluster display tidb-xxxx



10）查看集群日志是否有报错



11）测试集群的备份和binlog同步是否正常



12\) 确认没问题后，iptables防火墙开机启动

systemctl enable iptables



## 总结

1. Etcd漏洞修复方法有几种，需要注意每种方法对集群的影响。

2. 需要提前确认发生etcd漏洞机器上的所有端口，防止开启防火墙节点之间访问受阻。

3. 开启防火墙前，需要确认配置文件，避免开启防火墙ssh断连。

4. 检查集群状态无误后，需要设置防火墙开机启动。
