---
title: TiFlash 在开启了 TLS 的情况下会随机 crash
hide_title: true
---

# TiDB Operator v1.3.0-beta.1/v1.3.0，TiFlash 从低版本升级到 v5.4.0 后，元数据丢失，无法响应查询请求

解决方案 - Yin Su 更新于 2022.03.01

## Issue

TiDB Operator v1.3.0-beta.1/v1.3.0，TiFlash 从低版本升级到 v5.4.0 后，TiFlash 查询数据报错，日志中出现 “region not found in engine-store…” 的错误日志，TiFlash 元数据丢失，无法响应查询请求。

## Root Cause

TiDB Operator 对于 TiFlash < v5.4.0 使用配置 raft.kvstore_path = "/data0/kvstore" 配置项作为 kvstore 的路径存储元数据。 升级至 v5.4.0 后，TiDB Operator (v1.3.0-beta.1 和 v1.3.0) 根据 TiDB Operator 和 TiFlash team 使用新的配置项 storage.raft.dir = "/data0/kvstore"，格式为 string，但 TiFlash 侧将该项作为 array 使用。当该配置项是 string 而不是 array 时， TiFlash 识别为空 array，并使用默认值 /data0/db/kvstore。最终导致 TiFlash 丢失全部历史元数据。

**影响范围：**

1.这两个配置项都不是必选项，在官方对外文档也没有暴露，所以影响范围只限于使用 5.4.0 版本的 operator 用户。

2.raft.kvstore_path 和 storage.raft.dir 这两个配置项一直都是升级兼容的，如果保持配置不变，升级后不会出现任何问题。

3.storage.raft.dir 是 Tiflash 4.0.9 之后新增的配置项，用于代替 raft.kvstore_path（新版本仍然支持），目的是为了支持多盘部署。

4.Operator 从 5.4.0 开始使用 storage.raft.dir 配置项，但是由于 TiFlash 团队提供给 operator 的配置文档不正确（应该是 array 格式，写成了 string），导致生成了错误配置，从低版本升级上来后出现问题。

## Diagnostic Steps

1. 确认用户使用 TiDB Operator 部署集群，且 TiDB Operator 版本为 v1.3.0-beta1 或 v1.3.0
2. 确认用户部署的 TiDB 集群版本 >= 5.4.0，且集群中部署了 TiFlash
3. TiFlash 启动时，tiflash.log（serverlog container 日志输出） 日志中出现 "Raft data candidate path: /data0/db/kvstore/"（正常应该是 /data0/kvstore/）；tiflash_tikv.log （tiflash container 日志输出）日志中，在升级到 5.4.0 或以上版本后，第一次启动时出现 "region not found in engine-store" 的错误

**错误情况下的日志**

![img](https://lh3.googleusercontent.com/Qmb3OIh-IXCFARxI9xXxmUwARUn8975_Iyr5W6_LIEz3oQUqZvNkNe4Prcp_31i4vR5vATdPszN-1W3pA2b07SfDLKdL2qDJE6zQR-fetwrxL16JvKDB-XsMx9t-6HMupxwi75Eb)

![img](https://lh3.googleusercontent.com/meVIdEz6ATt6b8IGx1t6BQRMgLBlxNQuIvbphpoyti-_BMnXkFotMhwQ9E0TrdWPODizLOmGd6EA6jMHwE8SYim4HCBSkldnfZNGIlfkZO5RZC7hPGqnqrOui88Ni_lQ-6GaBdnA)

## Resolution

1. TiDB Operator 修改配置格式为 array，修复版本 v1.3.1
2. TiFlash 修改代码加上配置参数格式校验，修复版本 v5.4.1



## Workaround

如果使用 TiDB Operator v1.3.0-beta.1 或 v1.3.0，暂时先不要升级 TiFlash 到 v5.4.0，请先升级 TiDB Operator 到 v1.3.1 再升级 TiFlash。

如果已经升级并遇到问题，请参考下面步骤修复：

1. 参考文档 [https://docs.pingcap.com/zh/tidb-in-kubernetes/dev/deploy-tiflash#%E7%A7%BB%E9%99%A4-tiflash](https://docs.pingcap.com/zh/tidb-in-kubernetes/dev/deploy-tiflash#移除-tiflash) 删除 TiFlash

1. 重新配置并启用 TiFlash

spec**:**

tiflash:

…

config:

config: |

​ tmp_path = "/data0/tmp"

​ [storage]

​ [storage.main]

​ dir = ["/data0/db"]

​ [storage.raft]

​ dir = [ "/data0/kvstore" ]
