---
title: DDL 常见问题排查
hide_title: true
---

# DDL 常见问题排查

**作者：Zheng Qi**



## **DDL 概念原理**

详见 [TiDB DDL 架构](https://docs.google.com/document/d/1vl4B7QDGvmuTAs3p7ppEJFtpHJob1roqYwA-3m4ynsQ)



## DDL 对 DML 的影响

Information schema is changed 报错：详见 [触发 Information schema is changed 错误的原因](https://docs.pingcap.com/zh/tidb/stable/sql-faq#触发-information-schema-is-changed-错误的原因) 

Information schema is out of date 报错：详见 [触发 Information schema is out of date 错误的原因](https://docs.pingcap.com/zh/tidb/stable/sql-faq#触发-information-schema-is-out-of-date-错误的原因) 

Add index 对性能的影响：详见 [线上负载与 ADD INDEX 相互影响测试](https://docs.pingcap.com/zh/tidb/stable/online-workloads-and-add-index-operations)  



## DDL 执行慢

**已知情况** Add index：取决于表数据量大小和系统负载；空表加索引通常 3s 左右，5.0 版本以上 0.5s 左右 Create Database/Table 及其他 DDL：多数情况小于 1s，5.0 版本以上 0.5s 左右

**常见现象**



Case1: 多个 DDL 同时执行，通过 admin show ddl jobs 检查 DDL job 队列是否有等待。

Case2：启动集群后，执行的第一个 DDL 语句。

Case3：执行 kill -9 或异常掉电导致 TiDB 实例强制关闭。



Case4：TiDB 实例频繁启停，例如 TiDB 不断重复 panic 并被 systemctl 拉起的过程。

Case5：TiDB 版本不一致，例如升级过程中断导致某些 TiDB 未完成升级，通过 curl http://{TiDBIP}:10080/info/all 检查 TiDB 版本是否一致。

![image.png](https://pingcap-knowledge-base.oss-cn-beijing.aliyuncs.com/u/6/f/image1646444467990.png)

Case6：TiDB 和 PD 之间网络通信问题，比如网络中断、带宽打满等，通过 TiDB 监控面板 Schema Load 和 DDL 检查 Owner Handle Syncer Duration、Load Schema Duration 等延迟是否过高。

![img](https://lh6.googleusercontent.com/WApM-hclA4sZ6i_V72NjrrP7aJXGwFgNLl-g3zY-cGza7hr4s5uAFMwzec_hz33XLrIhJ_P3P6DI6c59ITRl91kgZ5WVNjyhO3a5eRwoJIrHx1o7f736cUKm-kbpCRWQQnZLHGJD)

![img](https://lh4.googleusercontent.com/9rhfBrRTvkjhY1Yjg3dJtaB4CscEiPnzJmdjfyKdc4DBWTePxxi0NdFTPhYWDWOXPtVWVZCpvBlsdbAeBTRiMxOM3ph1JUA7tAqwoKiPd-XkQhX3pzfMtTwfCw_H0EaJXgUfsal7)



Case7：集群高负载，读写 TiKV 延迟高，通过 TiDB 监控 Meta - Meta Operations Duration 99 检查 DDL meta 相关延迟是否升高。

![img](https://lh5.googleusercontent.com/vuHo4YbUTZ_b7p4_m8M5QiEnUY4lnbAshgq6FcO8zdTo1yC3AVGDngy82-dsUZk-ahhGDz48uHC0s5cu2Om6U8uSN44mqYDVBeNKUEPLIupN7kn2S0ZDTUBwpaCw9EkJ6RolOjqp)



Case8：对于 Add index，主要时间消耗在索引数据回填操作，大表加索引可以在业务低峰期适当调大 `tidb_ddl_reorg_batch_size` 和 `tidb_ddl_reorg_worker_cnt`。

Case9：创建带有 SHARD_ROW_ID_BITS 表时，使用 PRE_SPLIT_REGIONS 并且 `tidb_scatter_region` 设置为 1。

## DDL 执行卡住

1、排除以上 DDL 执行慢的情况，确认 DDL 是卡住了。

2、找出 DDL owner 节点。

通过 curl http://{TiDBIP}:10080/info/all 获取当前集群的 owner；

通过监控 DDL - DDL META OPM 查看某个时间段的 owner，如下图所示。

![img](https://lh5.googleusercontent.com/Rjnb2HIp6uSLHhDY-xRo2U_IeJb-JDW6W4nzX-1KqwQdvke_KDkuHuGZI_ZsEVJz-TpiMiWnp70-5IN1KU-jPX7ai0kLV9UwdZ-OorG1sZqSunhwnQ39yOgmW-PjaukpTqUgRdTN)

3、如果 owner 不存在，尝试手动触发 owner 选举。

curl -X POST http://{TiDBIP}:10080/ddl/owner/resign

4、如果 owner 存在，导出 goroutine 堆栈并检查可能卡住的地方。

curl -G "http://{TIDBIP}:10080/debug/pprof/goroutine?debug=2" > goroutine

此前出现过由于访问 TiKV 异常无法更新任务队列导致 DDL 卡住的问题。