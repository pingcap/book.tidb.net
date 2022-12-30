---
title: TiDB 生产集群与加密通讯TLS的辛酸苦辣 - 开启篇 - TiDB 社区技术月刊
sidebar_label: TiDB 生产集群与加密通讯TLS的辛酸苦辣 - 开启篇
hide_title: true
description: TiDB 生产集群遇到 etcd API 未授权访问的漏洞是如何处理的实践分享。
keywords: [TiDB, 生产集群, 加密通讯, TLS, Etcd]
---

# TiDB 生产集群与加密通讯TLS的辛酸苦辣 - 开启篇

> 作者：[caiyfc](https://tidb.net/u/caiyfc/answer)

## 一、背景

笔者在一个银行项目中，费尽千辛万苦，好不容易通过PoC测试。就当一切准备就绪，刚准备正常上线时，就传来了噩耗：未通过行里的漏洞扫描，发现存在高危漏洞，需要马上进行修复。这可给我吓坏了，赶紧查看了行里提供的漏洞报告，如下：

![](https://s2.loli.net/2022/10/13/6dyj48k5h9TagzC.png)

报告中也给出了解决办法：

- 1、给 TiDB 组件间通信开启加密传输
- 2、通过控制指定 IP 及端口来限制访问的范围

这两种方案各有利弊。于是结合现场情况，笔者选择了第一种方案，操作简单且安全性更高。那么问题来了，该如何开启TiDB集群中的 PD 节点通信加密呢？

## 二、现有集群开启TLS

### 1、什么是TLS

**传输层安全性协议**（英语：Transport Layer Security，[缩写](https://baike.baidu.com/item/缩写?fromModule=lemma_inlink)作**TLS**），及其前身**安全套接层**（Secure Sockets Layer，缩写作**SSL**）是一种[安全协议](https://baike.baidu.com/item/安全协议?fromModule=lemma_inlink)，目的是为[互联网](https://baike.baidu.com/item/互联网?fromModule=lemma_inlink)通信提供安全及数据[完整性](https://baike.baidu.com/item/完整性?fromModule=lemma_inlink)保障。[网景](https://baike.baidu.com/item/网景?fromModule=lemma_inlink)公司（Netscape）在1994年推出首版[网页浏览器](https://baike.baidu.com/item/网页浏览器?fromModule=lemma_inlink)，[网景导航者](https://baike.baidu.com/item/网景导航者?fromModule=lemma_inlink)时，推出[HTTPS](https://baike.baidu.com/item/HTTPS?fromModule=lemma_inlink)协议，以SSL进行加密，这是SSL的起源。[IETF](https://baike.baidu.com/item/IETF?fromModule=lemma_inlink)将SSL进行标准化，1999年公布第一版TLS标准文件。随后又公布RFC 5246 （2008年8月）与RFC 6176（2011年3月）。在[浏览器](https://baike.baidu.com/item/浏览器?fromModule=lemma_inlink)、[邮箱](https://baike.baidu.com/item/邮箱?fromModule=lemma_inlink)、[即时通信](https://baike.baidu.com/item/即时通信?fromModule=lemma_inlink)、[VoIP](https://baike.baidu.com/item/VoIP?fromModule=lemma_inlink)、[网络传真](https://baike.baidu.com/item/网络传真?fromModule=lemma_inlink)等应用程序中，广泛支持这个协议。主要的网站，如[Google](https://baike.baidu.com/item/Google?fromModule=lemma_inlink)、[Facebook](https://baike.baidu.com/item/Facebook?fromModule=lemma_inlink)等也以这个协议来创建安全连线，发送数据。目前已成为[互联网](https://baike.baidu.com/item/互联网?fromModule=lemma_inlink)上保密通信的工业标准。

### 2、现有 TiDB 集群中的 TLS

在已部署完成的 TiDB 集群中有两种方法开启TLS：

- 1、手动开启TLS，即使用 openssl 为每个组件生成对应的自签名证书，然后再每个组件中修改配置，增加证书与密钥的加载使用。想详细了解可以查阅：[为 TiDB 组件间通信开启加密传输 | PingCAP Docs](https://docs.pingcap.com/zh/tidb/stable/enable-tls-between-components)

- 2、使用高版本的 TiUP 组件，自动创建并使用证书文件与密钥，一条命令开启集群的 TLS。

手动开启 TLS 的方案不仅繁琐，而且出问题的概率真是大大的高。为了尽快解决问题，笔者当时选择了使用高版本 tiup 开启 TLS 的方案。

### 3、使用 TiUP 开启 TLS

#### 1、集群情况介绍

本文使用 TiDB 集群版本为 v5.1.4，使用的 TiUP 版本为 v1.11.0。如果集群中有 TiFlash 组件，需升级到 v5.2.4 以后的版本。

![image-20221013170210665](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/XoPGlLO1BjabTf5-1666751364036.png)

#### 2、升级 TiUP 版本

该功能对 TiUP 版本是有要求的，必须使用 TiUP v1.10.0 以后的版本。升级 TiUP 的方法很简单，如果是在线的集群，直接使用命令：`tiup update --self && tiup update cluster` 即可完成 TiUP 和 TiUP cluster 组件的升级。

如果是离线集群，有两个方法：

方法一：下载最新版部署介质（本文以 v6.1.0 为例）`tidb-community-server-v6.1.0-linux-amd64.tar.gz`，解压后找到 TiUP 与 TiUP cluster 组件的二进制文件，分别在压缩包 `tiup-v1.10.2-linux-amd64.tar.gz`  与 `cluster-v1.10.2-linux-amd64.tar` 中。可直接使用二进制文件进行后续的操作，但是这样做可能会有风险，新老版本的 TiUP 交替使用，可能会有未知问题。不推荐使用这种方法。

方法二：下载最新版部署介质，使用命令更新 TiUP  和 TiUP cluster 组件：

```shell
tar xzvf tidb-community-server-v6.1.0-linux-amd64.tar.gz && \ sh tidb-community-server-v6.1.0-linux-amd64/local_install.sh && \ source /home/tidb/.bash_profile

tiup update cluster
```

由于`local_install.sh` 脚本会自动执行 `tiup mirror set tidb-community-server-v6.1.0-linux-amd64` 命令将当前镜像地址设置为 `tidb-community-server-v6.1.0-linux-amd64`，所以升级完成之后，我们需要使用命令 `tiup mirror set <mirror-dir>` 将镜像源切换到生产环境中使用的镜像路径中，避免误操作导致的其他问题。

#### 3、检查节点服务状态

使用命令 `systemctl status node_exporter-9100.service` 检查是否有多于一个 node\_export service，如果有多个 node\_exporter service ，则会导致 PD 扩容加载失败，会在 PD 扩容时出现无法启动的问题。所以启动前可以先停止 node\_export 服务：`systemctl stop node_exporter-9100.service` 。

![image-20221013165759174](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/GM8e4QKEYvcN2iq-1666751364651.png)

#### 4、缩容 PD 节点

如果有多个 PD 节点，则需要把 PD 节点缩容到只剩一个，否则会有如下报错：

![image-20221013171151527](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/bBxih5ICk6X7wM3-1666751363815.png)

使用缩容命令：`tiup cluster scale-in tidb-test -N 10.3.70.172:2379,10.3.70.173:2379`

![image-20221013170350185](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/QZfsbg2Y1Gm5V8l-1666751363814.png)

检查缩容节点进程及端口资源是否释放，避免后续扩容PD时资源冲突导致加载失败。

#### 5、开启 TLS

开启 TLS 只需要一个命令：`tiup cluster tls tidb-test enable`，需要注意的是，该操作会重启集群，需要找到合适的时间进行操作。

![image-20221013171920093](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/gkv9KIyhwo2mO8A-1666751364170.png)

开启 TLS 之后，能够发现集群信息中，增加了证书和密钥的路径，以及dashboard中显示的不再是 http，而是 https 的访问网址了。

#### 6、检查 TLS 是否成功开启

执行命令：

```shell
tiup ctl:v5.1.4 etcd --endpoint=https://10.3.70.171:2379 --ca-file=/root/.tiup/storage/cluster/clusters/tidb-test/tls/ca.crt --cert-file=/root/.tiup/storage/cluster/clusters/tidb-test/tls/client.crt --key-file=/root/.tiup/storage/cluster/clusters/tidb-test/tls/client.pem member list
```

![image-20221013173841585](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/LKtG4rhTlEfn2Xw-1666751364373.png)

检查启用 TLS 是否成功，只需要确认 peerURLs 是否为 HTTPS 即可。

成功开启 TLS 之后，记得扩容在第4步中缩容的 PD 节点。

## 三、总结

1. 目前看来，在 asktug 上，选择开启 TLS 的人比较少，很少能看到相关的帖子，所以笔者想把自己的经验分享出来，给需要开启 TLS 的同学一些操作建议。
2. 开启 TiDB 现有集群 TLS 的方法还是挺简单的，一个命令足矣。但还是得注意相关的限制，比如要求的版本以及缩容 PD 节点的步骤，操作时需要万分小心。
3. 开启 TLS 后，所有通过 HTTP 访问 PD 节点的连接，都需要改为 HTTPS，并且要把证书加上。这一点在我们使用周边工具时，需要注意，比如 br 备份、lightning 等。