---
title: 如何处理损坏的sst文件 - TiDB 社区技术月刊
sidebar_label: 如何处理损坏的sst文件
hide_title: true
description: 本文记录通过dd破坏sst文件模拟损坏后使用tikv-ctl bad-ssts处理过程，本次测试数据库版本为5.3.3-ARM平台。
keywords: [TiDB, dd破坏, sst文件, tikv-ctl bad-ssts, ARM平台, TiDB 5.3.3]
---

# 如何处理损坏的sst文件

> 作者：[h5n1](https://tidb.net/u/h5n1/answer)

## 概述

TiDB在运行过程中可能由于文件系统或操作系统等原因出现sst文件损坏情况，从tidb 5.2版本开始支持tikv-ctl bad-ssts命令用于处理损坏的sst文件，官方文档中已经给出了比较详细的解释，但在按照[官方文档](https://docs.pingcap.com/zh/tidb/v5.3/tikv-control)操作时会有些问题。

本文记录通过dd破坏sst文件模拟损坏后使用tikv-ctl bad-ssts处理过程，本次测试数据库版本为5.3.3-ARM平台。

## 操作过程

1、 初始化一张1000万的数据表，随意查看该表上的region，本次模拟破坏的是store 12上的sst文件。

```
$ pd-ctl region 348
{
 "id": 348,
 "start_key": "7480000000000000FF3B5F728000000000FF8A88290000000000FA",
 "end_key": "7480000000000000FF3B5F728000000000FF90D3980000000000FA",
 "epoch": {
  "conf_ver": 59,
  "version": 51
 },
 "peers": [
  {
   "id": 350,
   "store_id": 11,
   "role_name": "Voter"
  },
  {
   "id": 2532,
   "store_id": 5,
   "role_name": "Voter"
  },
  {
   "id": 14052,
   "store_id": 12,
   "role_name": "Voter"
  }
 ],
 "leader": {
  "id": 350,
  "store_id": 11,
  "role_name": "Voter"
 },
 "written_bytes": 156,
 "read_bytes": 0,
 "written_keys": 2,
 "read_keys": 0,
 "approximate_size": 114,
 "approximate_keys": 821741
}
```

2、 使用region-properties 查找该region的sst文件，并使用dd 命令进行破坏

```
$ ./tikv-ctl --host xx.xxx.144.16:20160 region-properties -r 348
[2022/10/13 21:39:37.318 +08:00] [INFO] [<unknown>] ["TCP_USER_TIMEOUT is available. TCP_USER_TIMEOUT will be used thereafter"]
[2022/10/13 21:39:37.319 +08:00] [INFO] [<unknown>] ["New connected subchannel at 0xfffb600d0120 for subchannel 0xfffc200d2bc0"]
mvcc.min_ts: 436638484783693826
mvcc.max_ts: 436638579797524498
mvcc.num_rows: 410870
mvcc.num_puts: 410870
mvcc.num_deletes: 0
mvcc.num_versions: 821741
mvcc.max_row_versions: 3
num_entries: 821741
num_deletes: 0
num_files: 1
sst_files: 000417.sst
region.start_key: 7480000000000000ff3b5f728000000000ff8a88290000000000fa
region.end_key: 7480000000000000ff3b5f728000000000ff90d3980000000000fa
region.middle_key_by_approximate_size: 7480000000000000ff3b5f728000000000ff8dd4ba0000000000faf9f0bf9c25a7fffe
 
$ ls -l /data/v5.0.3/tikv/data/db/000417.sst
-rw-r--r-- 1 tidb tidb 41907560 Oct 13 21:29 /data/v5.0.3/tikv/data/db/000417.sst
 
[tidb@tgypt-xx13d002-cs76w v5.3.3]$ dd if=/dev/zero of=/data/v5.0.3/tikv/data/db/000417.sst bs=1M count=42
42+0 records in
42+0 records out
44040192 bytes (44 MB, 42 MiB) copied, 0.0284878 s, 1.5 GB/s
[tidb@tgypt-xx13d002-cs76w v5.3.3]$ ls -l /data/v5.0.3/tikv/data/db/000417.sst
-rw-r--r-- 1 tidb tidb 44040192 Oct 13 21:42 /data/v5.0.3/tikv/data/db/000417.sst
```

3、 破坏sst文件后tikv并没有立即崩溃，重启tikv后tikv.log报错如下，无法启动：

```
 [2022/10/13 21:47:34.605 +08:00] [ERROR] [server.rs:1056] ["failed to init io snooper"] [err_code=KV:Unknown] [err="\"IO snooper is not started due to not compiling with BCC\""]
[2022/10/13 21:47:34.624 +08:00] [FATAL] [server.rs:1281] ["failed to create kv engine: Storage Engine Corruption: Sst file size mismatch: /data/v5.0.3/tikv/data/db/000417.sst. Size recorded in manifest 41907560, actual size 44040192\n"]
```

4、根据官方文档提供的命令使用bad-ssts检测有问题的sst文件，尝试使用--db 指定db目录 和--data-dir指定data-dir目录均报参数错误，于是使用了5.3.1的tikv-ctl + --db参数后执行正常(之所以使用5.3.1是因为之前使用过该版本命令)。

```
$ ./tikv-ctl  bad-ssts --db /data/v5.0.3/tikv/data/db --pd 10.125.144.17:2379
```


```
error: Found argument '--db' which wasn't expected, or isn't valid in this context
 
$ /data/soft/v5.3.1/tikv-ctl  bad-ssts --db /data/v5.0.3/tikv/data/db --pd 10.125.144.17:2379
[2022/10/13 22:07:44.853 +08:00] [INFO] [util.rs:544] ["connecting to PD endpoint"] [endpoints=10.125.144.17:2379]
[2022/10/13 22:07:44.854 +08:00] [INFO] [<unknown>] ["TCP_USER_TIMEOUT is available. TCP_USER_TIMEOUT will be used thereafter"]
[2022/10/13 22:07:44.854 +08:00] [INFO] [<unknown>] ["New connected subchannel at 0xfffba02701b0 for subchannel 0xfffc200d2bc0"]
[2022/10/13 22:07:44.855 +08:00] [INFO] [util.rs:544] ["connecting to PD endpoint"] [endpoints=http://10.125.144.17:2379]
[2022/10/13 22:07:44.855 +08:00] [INFO] [<unknown>] ["New connected subchannel at 0xfffba02702d0 for subchannel 0xfffc200d2a00"]
[2022/10/13 22:07:44.856 +08:00] [INFO] [util.rs:544] ["connecting to PD endpoint"] [endpoints=http://10.125.144.18:2379]
[2022/10/13 22:07:44.856 +08:00] [INFO] [<unknown>] ["New connected subchannel at 0xfffba02703f0 for subchannel 0xfffc200d2bc0"]
[2022/10/13 22:07:44.856 +08:00] [INFO] [util.rs:668] ["connected to PD member"] [endpoints=http://10.125.144.18:2379]
[2022/10/13 22:07:44.856 +08:00] [INFO] [util.rs:536] ["all PD endpoints are consistent"] [endpoints="[\"10.125.144.17:2379\"]"]
--------------------------------------------------------
corruption info:
/data/v5.0.3/tikv/data/db/000417.sst: Corruption: Bad table magic number: expected 9863518390377041911, found 0 in /data/v5.0.3/tikv/data/db/000417.sst
 
sst meta:
417:41907560[0 .. 0]['7A7480000000000000FF3B5F728000000000FF8A88290000000000FAF9F0BF866BEFFFEE' seq:0, type:1 .. '7A7480000000000000FF3B5F728000000000FF90D3970000000000FAF9F0BF9BCB07FFFD' seq:0, type:1] at level 6 for Column family "write" (ID 2)
 
overlap region:
RegionInfo { region: id: 348 start_key: 7480000000000000FF3B5F728000000000FF8A88290000000000FA end_key: 7480000000000000FF3B5F728000000000FF90D3980000000000FA region_epoch { conf_ver: 59 version: 51 } peers { id: 350 store_id: 11 } peers { id: 2532 store_id: 5 } peers { id: 14052 store_id: 12 }, leader: Some(id: 350 store_id: 11) }
 
suggested operations:
tikv-ctl ldb --db=/data/v5.0.3/tikv/data/db unsafe_remove_sst_file "/data/v5.0.3/tikv/data/db/000417.sst"
tikv-ctl --db=/data/v5.0.3/tikv/data/db tombstone -r 348 --pd <endpoint>
--------------------------------------------------------
corruption analysis has completed
```

上述检查数的详细信息参加官方文档说明

5、 按照上述输出的建议命令执行tikv-ctl ldb --db=/data/v5.0.3/tikv/data/db unsafe_remove_sst_file "/data/v5.0.3/tikv/data/db/000417.sst"

报错：Failed: Failed to parse SST file number /data/v5.0.3/tikv/data/db/000417.sst 。分析该错误提示 不能解析 SST file number ，看起来这里应该指定sst的文件号。而前面bad-sst检查时的输出Meta信息中包含sst文件号，和sst文件名中一致。

```
$ /data/soft/v5.3.1/tikv-ctl  ldb --db=/data/v5.0.3/tikv/data/db unsafe_remove_sst_file "/data/v5.0.3/tikv/data/db/000417.sst"
[2022/10/13 22:09:21.574 +08:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/10/13 22:09:21.574 +08:00] [INFO] [mod.rs:479] ["encryption is disabled."]
Failed: Failed to parse SST file number /data/v5.0.3/tikv/data/db/000417.sst
```

6、 使用 sst文件号执行成功

```
$ /data/soft/v5.3.1/tikv-ctl  ldb --db=/data/v5.0.3/tikv/data/db unsafe_remove_sst_file 417
[2022/10/13 22:09:44.747 +08:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/10/13 22:09:44.748 +08:00] [INFO] [mod.rs:479] ["encryption is disabled."]
unsafely removed SST file
```

再次执行该命令提示已经在rockdb中找不到该文件

`Failed: failed to unsafely remove SST file: NotFound: File not present in any level `

7、 执行 region tombstone 命令从有问题的tikv上删除sst文件的region peer，该命令同样在--data-dir/--db/--pd参数使用上报错，最后使用--force处理成功

`$ /data/soft/v5.3.1/tikv-ctl  --data-dir /data/v5.0.3/tikv/data tombstone -r 348 --force`

```
[2022/10/13 22:14:19.246 +08:00] [INFO] [mod.rs:118] ["encryption: none of key dictionary and file dictionary are found."]
[2022/10/13 22:14:19.246 +08:00] [INFO] [mod.rs:479] ["encryption is disabled."]
[2022/10/13 22:14:19.268 +08:00] [WARN] [config.rs:587] ["compaction guard is disabled due to region info provider not available"]
[2022/10/13 22:14:19.268 +08:00] [WARN] [config.rs:682] ["compaction guard is disabled due to region info provider not available"]
success!
```

8、再次检查region，发下tidb中已经删除store 12上的peer 而在store 上补了副本

```
$ pd-ctl region 348
{
 "id": 348,
 "start_key": "7480000000000000FF3B5F728000000000FF8A88290000000000FA",
 "end_key": "7480000000000000FF3B5F728000000000FF90D3980000000000FA",
 "epoch": {
  "conf_ver": 65,
  "version": 51
 },
 "peers": [
  {
   "id": 350,
   "store_id": 11,
   "role_name": "Voter"
  },
  {
   "id": 2532,
   "store_id": 5,
   "role_name": "Voter"
  },
  {
   "id": 17637,
   "store_id": 2,
   "role_name": "Voter"
  }
 ],
 "leader": {
  "id": 350,
  "store_id": 11,
  "role_name": "Voter"
 },
 "written_bytes": 157,
 "read_bytes": 0,
 "written_keys": 2,
 "read_keys": 0,
 "approximate_size": 114,
 "approximate_keys": 821741
}
```

9、重新启动tikv，tikv能正常启动，检查表中数据无丢失

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1665672133210.png)

## 3  总结

使用tikv-ctl bad-ssts 处理损坏的sst文件在官方文档已经有说明，但命令参数、输出结果上有些错误，导致按照文档操作有些问题，建议官方进行一下修改。