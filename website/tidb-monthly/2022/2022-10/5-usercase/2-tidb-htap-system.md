---
title: How Good is TiDB as an HTAP System? A HATtrick Benchmark - TiDB 社区技术月刊
sidebar_label: How Good is TiDB as an HTAP System? A HATtrick Benchmark
hide_title: true
description: The paper concludes that analytical queries running on TiDB always read the latest data. This is an essential feature for businesses that want to make decisions based on the most current information.
keywords: [TiDB, HTAP, HATtrick, Benchmark, System]
---

# How Good is TiDB as an HTAP System? A HATtrick Benchmark

> **Author:** [Jinpeng Zhang](http://github.com/zhangjinpeng1987) (TiDB Cloud Engineer) 
>
> **Editors:** [Calvin Weng](http://github.com/dcalvin), Tom Dewan 



I’m one of the developers of TiDB, a Hybrid Transactional and Analytical (HTAP) database. Recently, I read the SIGMOD 22 paper, “[How Good is My HTAP System](https://dl.acm.org/doi/pdf/10.1145/3514221.3526148),” which uses TiDB as one of its research subjects. I really appreciate the authors’ work —, especially their methodology and the tooling they created to observe and benchmark HTAP performance. For example, the HATtrick benchmark tool not only produces Online Transactional Processing (OLTP) and Online Analytical Processing (OLAP) workloads simultaneously, it also evaluates the freshness of OLAP queries on an HTAP system. 

The paper concludes that analytical queries running on TiDB always read the latest data. This is an essential feature for businesses that want to make decisions based on the most current information.

However, the TiDB performance test results weren’t up to our standards. In an effort to learn more, I reproduced the HATtrick tests and discussed them here. I hope this information gives you greater insight to HTAP in general and TiDB specifically. 

## How HATtrick works

The author’s benchmark tool, HATtrick, combines the Star Schema Benchmark (SSB) for analytical workloads and the TPCC benchmark for transactional workloads. This design allows HATtrick to send transactional queries and analytical queries to the database simultaneously to measure the performance isolation between the two workloads. The paper also introduces the concept of “throughput frontier,” which shows transactional throughput and analytical throughput in one diagram. Throughput frontier is an intuitive way to track performance isolation between transactional and analytical processing (AP) and (TP).

For example, in the following frontier diagram, the red dotted line is the “bounding box,” and the blue dotted line is the “proportional line.” The green solid line indicates the system’s capability when it runs AP and TP queries simultaneously. The closer the green solid line is to the bounding box, the better performance isolation between TP and AP.

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/22222-1665478710403.jpeg) 

> *Performance isolation shown in the frontier*

## What is HTAP “freshness”?

This paper also defined the “freshness” of an HTAP system: 

*An HTAP system provides fresh analytics if every analytical query is executed on an up-to-date version of the operational data. Else, it provides stale analytics.* 

HATtrick benchmark includes a freshness table that records the version of the transactional queries that have been processed. The benchmark uses this table to check the versions retrieved by the analytical queries. If the analytical queries always retrieve the latest version of the data, the freshness score is 0s. In the following frontier chart, the freshness score is 1.5s; that is, the analytical queries can only retrieve the data that’s been stale for 1.5 seconds.

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/3333-1665478834894.jpeg) 

> *A frontier chart freshness score*

## Run HATrick on TiDB again

TiDB is a distributed HTAP database. It has a dedicated row engine, TiKV, and a dedicated column engine, TiFlash. The TiDB optimizer automatically routes transactional queries to TiKV and analytical queries to TiFlash. Theoretically, if there are no resource conflicts between TiDB, TiKV, and TiFlash, there is great performance isolation between the two types of queries. 
Also, TiDB has a disaggregated architecture that separates storage and computing. This allows users to scale AP or TP throughput by adding or removing TiDB instances as needed.

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/4444-1665478908195.png) 

> *TiDB architecture*

My retesting with HATtrick focused on: 

- The performance isolation between TP and AP for HTAP 
- The scalability of both TP and AP

## Benchmark the performance isolation between TP and AP

We reran the HATrick scale factor 100 test with a newer TiDB configuration::

- Software version: TiDB 6.1
- CPU: 2.4 Ghz Intel® Xeon® Silver 4214R CPU with 24 physical cores, 
- Memory: 128 GB RAM 
- Hard drive: 500 GB Solid-state drive (SSD)
- Cluster: 1 TiDB node, 1 TiFlash node, 3 TiKV nodes 
- Dataset: 59 GB

We called this configuration TiDB 1x.

The following frontier chart shows our results. The green solid line, which indicates TP/AP throughput, is pretty close to the bounding box. This means there is little interference between the two types of queries, and that all analytical queries can get the latest transactional data. This result matches the dual engine design of TiDB. We can conclude that TiDB has a great performance isolation between transactional queries and analytical queries. 

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/6666-1665478976037.jpeg) 

> *HATtrick benchmark results for TiDB performance isolation*

[Request an HTAP demo](https://www.pingcap.com/contact-us/) 

## Benchmark TiDB horizontal scalability

For this test, we update our TiDB-1x configuration. We added a new TiDB server and a new TiFlash server, and deployed three more TiKV instances on existing TiKV servers. We called this configuration TiDB-2x.

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/屏幕快照2022-10-11下午5.06.20-1665479193881.png) 

> *Scaling TiDB for the horizontal scalability test*

## Alleviate the hotspot issue

Distributed systems often have hotspots, and this can degrade performance. It’s always necessary to alleviate the issue in either a production environment or a test to achieve an optimal performance. When we first ran this benchmark, we encountered a hotspot. Unlike the original HATtrick benchmark, we made some changes to alleviate the hotspot. We used

```markdown
shard_row_id_bits
```

to avoid hotspot on table rows

```markdown
unique key + tidb_shard
```

to a avoid hotspot on the index instead of the primary key

After we fixed hotspot, the writing was evenly distributed, as indicated in the following heat map:

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/676767-1665479354438.png) 

> *Hotspot alleviated on TiDB (generated via the TiDB Dashboard）*

## Validate TiDB scalability in the frontier

To show the scalability, we compared the results of the TiDB-1x and TiDB-2x configurations on the same frontier chart. The chart shows that both the maximum transactional QPS and the maximum analytical QPS of TiDB-2x are two times greater than that of TiDB-1x. The benchmarking shows TiDB’s performance of both AP and TP scale horizontally by adding nodes as needed. As a comparison, we also ran the HATtrick benchmark test on PostgreSQL with the same configuration. 

![no-alt](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/10101010-1665479552809.png) 

> *TiDB’s performance has good horizontal scalability*

## Conclusion

Our sf100 benchmarking with HATtrick validates TiDB’s capabilities as an HTAP database:

- Analytical queries can always read the latest data in TiDB.
- There is a great performance isolation between analytical queries and transactional queries in TiDB, thanks to its dual storage engine architecture.
- TiDB can horizontally scale the throughput for both analytical and transactional workloads, thanks to its disaggregated storage and computing architecture.

Our testing process and results also validate HATtrick as a practical benchmarking methodology that is applicable in both academia and business. We’d like to thank [the authors ](https://dl.acm.org/doi/abs/10.1145/3514221.3526148) of the paper, and we look forward to any HTAP-related research they do in the future. In the meantime, if you’ve used HATrick to benchmark your TiDB database, feel free to share your results with us. You can also join our [Slack](https://slack.tidb.io/invite?team=tidb-community&channel=everyone&ref=pingcap-blog)  and [TiDB Internals](https://internals.tidb.io/)  for discussions.