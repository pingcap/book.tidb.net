# 最佳实践 | tidb-lightning 使用 tidb-backend 模式导入优化

## 作者介绍

苏志鹏，TiDB DBA，TUG 2021 年度 MVA，拥有丰富的运维与交付经验，对相关数据库的原理及应用有浓厚兴趣



## **项目背景**

近日，一个主 AP 业务项目 MyCat 下迁 TIDB 迁移，原分库分表架构（16 台 server） AP 大 SQL 普遍需 2 小时跑出结果，POC 实测（5 台 server）该类 SQL 调优后 TiDB 下 20 分钟内均能出结果，能获得近乎 5 倍下迁收益。



## **问题描述**

原有业务场景中，需每月定期往数据库以 LOAD LOCAL FILE 的方式导入约 1 亿左右宽表数据，但原有方式测下来，TiDB 的 LOAD 耗时约 8 小时，刨除 POC 性能没有生产好等原因，也是运维人员不可接受的。

因为 TiDB AP SQL 上的优化，业务方也有了加速数据更新的想法，即：将 LOAD 数据周期从每月改为每周。如果该这个问题无法解决，该方案基本无法改变。

因项目原因在低于 TiDB 官网硬件标准的 非 SSD 磁盘又测了一版结果，测试过程中暴露出 LOAD LOCAL FILE 当时导入数据无法保证原子性导入的问题。具体表现为由于 TiKV 写入过慢报错 LockNotFound 事务锁被清除，[详情参考官网解释](https://docs.pingcap.com/zh/tidb/dev/troubleshoot-lock-conflicts#锁被清除-locknotfound-错误)，但该场景中，可能出现 LOAD 进去 5 千万数据导入失败，此时需要反向 Delete 掉已导入的数据，代价极高，即使分批 del 也很难判定本次导入了哪些数据，无很好方式业务实现方法。

总结问题点：

1. TiDB 同 MySQL 用 LOAD 方式导入 csv 文件过慢
2. LOAD 方式导入数据无法保证原子性导入



## **分析原因**

1. 导入过慢的原因是 LOAD 是单线程方式工作，没有利用并发多线程导入加速。
2. LOAD 走的是 batch insert 接口，默认会将 csv 文件切分为多份、构成多个小事务提交。(注意 : MySQL 的实现也是 batch insert，所以理论上也存在该风险)



## **解决方案**

断点续传：利用 Lightning 的断点续传功能保证原子性导入， 具体原理：假设切分成了 50 个 csv 文件，lightning 导入某种原因中途断掉，所有 lightning 线程停止工作，重启后会基于 check_point 读出表信息、排序目录、taskid（关键），可以顺着 taskid 继续下一个 task 完成断点续传，实现最终一致；

加速导入：导入前 Shell 脚本拆分 csv 文件为多份，配合 lightning 参数 region-concurrency, 该参数默认表示 CPU 实际占用核数，默认 100% 占用。其实一旦拆分文件超过该值已经无意义了，并没有加速上的优化意义。（注意：但可以依据日志中打印的文件号，推断导入进度，其实认为 mysql client count 也可以实现同样目的）

脚本共享：虽然 tidb-lightning 自身存在切分文件为 256M 的功能，但要求 strict-format = true。因为该项目数据由 Teradata 上导出，且受限企业 csv 文件规范要求无法更改，所以我为该项目做了个处理脚本取名 [TiChange_for_lightning](https://github.com/jansu-dev/TiChange_for_lightning) 希望能帮到大家，具体使用参考 README！

注意：:warning: 该工具除格式转换外，仅对 tidb-backend 模式导入速度进行优化，其他模式（importer、local）并无速度上优化。

Plain Text

```Plain%20Text
./TiChange_for_lightning.sh 
Auther : jan su
Introduce : TiChange_for_lightning 是一个能让你快速将csv文件适配 tidb-lightning csv 文件格式要求的工具，如有任何 BUG 请及时反馈，作者将及时修复！ 

Usage: TiChange_for_lightning.sh [option] [parameter]
option: -i --input-file [input_csv_path] | | 需要处理的csv文件路径;
        -o --operate-path [operate_dir_path] | | 需要处理csv文件的，空间足够的文件夹路径;
        -m --schema-meta [schema_meta] | | 需要指定库中 csv 文件所属对象信息，eg: -m schema_name.table_name;
        -s --separator_import [separator_import_format] |(default: ',' )| 需要指定当前 csv 文件字段分隔符，eg: -s '||' TiChange 自动将其转换为 "," : "A"||"B" --> "A","B" ;
        -d --delimiter_import [delimiter_import_format] |(default: '"' )| 需要指定当前 csv 文件引用定界符，eg: -d '' TiChange 自动将其转换为 '"' : ABC --> "ABC" ;
        -n --null_import [null_import_format] |(default: '\N')| 需要指定解析 csv 文件中字段值为 NULL 的字符， eg: '\N' 导入 TiDB 中会被解析为 NULL ;
        -h --help | | 获取关于 TiChange.sh 的操作指引，详细 Demo 请参考 ： https://github.com/jansu-dev/TiChange_for_lightning ;
```

