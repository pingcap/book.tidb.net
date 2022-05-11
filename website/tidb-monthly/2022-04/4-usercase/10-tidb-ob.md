---
title: Oceanbase 和 TiDB 粗浅对比——执行计划
hide_title: true
---

# Oceanbase 和 TiDB 粗浅对比——执行计划

**作者：[h5n1](https://tidb.net/u/h5n1/answer)**



## 一、前言

OceanBase和TiDB作为国内2款的比较流行的兼容MySQL协议的开源数据库使用者也越来越多，两种数据库不仅在架构原理上有较大差异，在开源方式上有较大的不同：

TiDB 采用的Apache License 2.0开源协议，其第一行代码提交就是在github上，和企业版相比社区版只是不包含访问白名单和审计2个插件功能，其他与企业版完全相同且同步发版(之前闭源的tiflash也于2022.4.1完全开源)。

OceanBase社区版采用国内的木兰公共协议 MulanPubL-2.0开源，官方划分成社区版、云服务版、企业版三种类型，开源的社区版与企业版相比存在较多功能缺失或性能降低(如目前对比版本不支持oracle兼容、不支持闪回、不支持analyze语句、ocp不支持备份功能等)，且社区版本版发布与企业版不同步。另外ob的文档和资源相比较tidb还不够完善和丰富。

本文针对tidb、oceanbase在执行计划的相关内容进行粗浅的对比，也对学习做个总结，对比版本为OceanBase3.1.2-CE(2022-03-29发版 )、TiDB v5.2.3(2021-12-31发版)

## 二、查看执行计划

-  **TiDB：**

(1)  explain SQL方式：该方式只是展示可能的执行计划并非实际的执行计划，目前各数据库都存在此问题使用explain方式并不是真正SQL执行时的计划，少数情况下会存在不一致。

(2)  explain analyze方式：该方式会真正执行SQL并展示执行时的执行计划，执行计划中增加实际的执行信息包括实际返回行数、各算子时间和调用及资源消耗等。

(3)  select tidb_decode_plan()方式: tidb的慢SQL日志里会以hash值方式记录慢SQL的执行计划，然后使用tidb_decode_plan()函数即可解析。

(4)  dashboard查看：tidb的PD组件包含dashboard功能，慢SQL、SQL统计页面可以查看每个SQL的执行计划

- **OceanBase:**

(1)  explain SQL方式：包含BASIC、OUTLINE、EXTENDED、EXTENDED_NOADDR、PARTITIONS、FORMAT = {TRADITIONAL| JSON}多个展示选项，除了extended方式大部分情况展示的内容基本一致，extended方式时会增加hint、outline、plan type、optimizerinfo等信息。

(2)  使用系统视图方式：oceanbase在实现上一直努力方便oracle dba使用，通过v$plan_cache_plan_explain/ v$plan_cache_plan_stat等视图可以查看执行计划及算子的执信息(如行数、时间等)，类似oracle的v$sql、v$sql_plan等视图

(3)  因未部署ob 图形化管理平台ocp，因此未看SQL执行计划的页面展示。

## 三、执行计划内容

- **TiDB:**

TiDB的执行计划展示与oracle类似，以缩进的方式展示算子间的层次关系，同时使用折线进行算子连接展示，当SQL复杂执行步骤较多时可以很明显看出处于同一缩进深度的算子，explian方式下执行计划包括算子信息(id列)、预估行数(estRows列)，访问对象(access object列)、过滤条件和操作信息(operator info列)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755615294.png)

使用explain analyze或查看慢SQL中记录的执行计划时还包括每个算子实际的返回行数(actRows列)、算子的执行时间和分布统计(execution info列)、内存占用(memory)、磁盘读(dsik)

execution info列展示的内容如下：

|                                                              |
| ------------------------------------------------------------ |
| tikv_task:{proc max:640ms, min:120ms, p80:260ms, p95:470ms, iters:4859, tasks:27}, scan_detail: {total_process_keys: 4861956, total_keys: 4861983, rocksdb: {delete_skipped_count: 420892, key_skipped_count: 4861956, block: {cache_hit_count: 202, read_count: 18548, read_byte: 493.0 MB}}} |

execution info因为是和每个算子展示成一行，且信息较多输出时较多换行，对执行计划阅读有些影响，如果能放到下面进行额外展示的话，就能使执行计划步骤展示看起来更方便些。

- **OceanBase:**

Oceanbase将执行计划划分为了本地执行计划、远程执行计划、分布式执行计划。执行计划展示非常接近oracle的展示方式，explain basic下展示执行计划和output&filter。 树形执行计划中包括算子展示id、算子内容(OPERATOR列)、访问的对象信息(NAME列)、预估行数(EST. ROWS)、评估的成本(COST)。output&filter展示的列过滤和投影后列信息，相比oracle展示的内容没有access信息，且列值可读性差。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755631210.png)

​在exteneded方式下还包括SQL使用HINT、SQL执行生产的outline(outline部分基本和oracle一致)、优化器的执行信息optimizer info。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755641565.png)

Oceanbase中关于路径访问的算子较少，目前只有TABLE GET(直接主键定位)、TABLE SCAN(全表或索引扫描回表)、LOOKUP TABLE(全局索引扫描回表)，针对执行计划中是否使用索引需要结合name列是否有索引以及filter中is_index_back=true判断，对于扫描方式不够直接和方便，比如索引全扫描、索引范围扫描、是否使用覆盖索引等。对于分区信息的显示ocenbase和oracle一样展示的分区partition id，tidb内展示的是分区名更直观一些。

## 四、慢SQL记录

- **TiDB:**

超过slow_launch_time参数值的SQL会被记录到tidb_slow_query.log。可通过information_schema.CLUSTER_SLOW_QUERY或dashboard查看。

- **Oceanbase:**

执行时间超过trace_log_slow_query_watermark参数值设置的会记录到observer.log。

使用视图v$plan_cache_plan_explain/ v$plan_cache_plan_stat也可以按条件过滤慢SQL，不过查询时如果没有指定ip\port\tenant\plan_id等条件是数据返回空行，即使count(*)整个基表表也是返回空。

此外还可以通过v$sql_audit视图查询会话和SQL执行信息，其类似于oracle的v$session视图。

## 五、HINT

对于hint使用OceanBase和tidb的方式基本一样，oceanbase中除了常规的hint外，还可以像oracle一样使用 outline data作为hint内容。

## 六、执行计划绑定

- **TiDB:**

TiDB执行计划绑定功能叫SPM(sql plan managment)包括手动绑定执行计划、自动捕获执行计划和演进功能。执行SQL绑定时会将SQL进行标准化进行变量值的替换和空格转换等，在执行SQL时会将SQL进行标准化，与标准化后的SQL进行比对，如果一直则使用绑定的执行计划。TiDB中绑定SQL与原始SQL大小写不一致、空格换行不一致等不影响绑定使用。TiDB内不能使用SQL_digest/plan_digest等hash值方式进行SQL绑定，在创建和删除绑定时都必须使用原始SQL和HINT SQL，对于较长的复杂SQL不是很方便。

执行计划绑定详细信息可参考官方文档和专栏文章：https://tidb.io/blog/83b454f1

- **OceanBase:**

Oceanbase的执行计划绑定可使用2种方式，2个从概念上都参考了oracle，一个是使用outline方式进行执行计划绑定，一个是使用SPM方式进行绑定和执行计划捕获和演进(开源版不支持SPM)。Outline使用方式和tidb创建SQL binding类似都是使用HINT SQL和原始SQL绑定，不过oceanbase的SQL绑定严格要求原始SQL和HINT SQL必须完全一致（类似oracle的sql_id计算），大小写和空格对绑定有影响。Oceanbase支持使用SQL_ID、PLAN_ID的值进行执行计划绑定，方便绑定操作。

无论TiDB还是OceanBase两个都不支持HINT SQL使用force index类提示绑定执行计划。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755659091.png)

​Oceanbase的SPM执行计划管理和oracle非常类似，都是使用dbms_spm包进行管理，其语法基本一致，同样通过几个参数控制是否进行自动绑定和演进。

 

## 七、执行计划缓存

- **TiDB:**

使用Prepare/execute方式，Prepare 时将参数化的 SQL 查询解析成 AST（抽象语法树），每次 Execute 时根据保存的 AST 和具体的参数值生成执行计划，对于Prepare的语句在第一次execute时会检查该语句是否可以使用执行计划缓存(比如包含分区表、子查询的语句不能缓存)，如果可以则将语句执行计划放入到缓存中，后续的execute会首先检查缓存中是否有执行计划可用，有的话则进行合法性检查，通过后使用缓存的执行计划，否则重新生成执行计划放入到缓存中。

缓存是session级的，以LRU链表方式管理，链表元素为kv对，key由库名、prepare语句标识、schema版本、SQL_Mode、timezone组成，value是执行计划。通过prepared-plan-cache下的相关选项可以控制是否启用缓存、缓存条目数和占内存大小。

- **OceanBase:**

Oceanbase内除了可以使用prepare方式外，oceanbase对执行计划缓存参照oracle做了大量工作。和Oracle rac类似每个observer只管理自己节点上的缓存，不同节点相同SQL缓存的执行计划可能不同。

Oceanbase将SQL文本进行参数化处理后作为执行计划缓存的键值key，value是执行计划。Oceanbase的SQL匹配也参考了oracle，引入了cursor_sharing参数和HINT，参数值为excat要求SQL匹配必须完全一样，包括空格、大小写、字段值等。参数值为force时则以参数化后的SQL进行匹配。

除此之外ocenabase也引入了自适应游标共享ACS功能，针对一个SQL在使用不同字段值时使用不同的执行计划，通过参数可控制是否开启该功能。

缓存的执行计划可通过通过v$plan_cache_plan_explain/ v$plan_cache_plan_stat查看。

开源版不支持cursor_sharing和ACS功能。

## 八、统计信息

- **TiDB:**

tidb统计信息收集包括自动统计信息收集和手动统计信息收集。自动统计信息收集根据表的情况和参数tidb_auto_analyze_start_time/tidb_evolve_plan_task_end_time/ tidb_auto_analyze_ratio决定何时进行统计信息收集。手动统计信息收集根据需要随时执行analyze SQL。

TiDB支持feedback特性，即在SQL执行时根据实际的执行信息去更新统计信息，以使统计信息根据准确和及时更新，不过由于feedback特性会导致一些问题，改特性默认为关闭。Oracle数据库在11g引入该特性时也引起一些问题，大部分情况DBA会将该功能关闭。

Tidb内的统计信息可以使用show stats_meta/stats_buckets/stats_histograms等查看。

​     关于统计信息收集的更详细收集可参考：https://tidb.io/blog/92447a59

- **OceanBase:**

Oceanbase社区版不支持analyze语句收集统计信息(商业版3.2才引入)，存储层进行合并时更新统计信息，可以手工触发合并操作进行更新。SQL执行时从memtable进行动态采样，采样比例固定，无法更改。

相关统计信息可从_all_table_stat，__all_column_stat, __all_histogram_stat等系统视图查看。

 ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755681019.png)![img](fi



## 九、SQL trace

- **TiDB:**

tidb 直接使用trace SQL执行即可展示trace结果。Operation列展示函数调用层次和访问的region信息，startTS了展示该步的开始时间，duartion展示该步的消耗时间。

   ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755703379.png)

- **OceanBase:**

OceanBase的trace使用类似和结果类似于mysql的Profiling。执行过程如下：

(1)  开启trace: SET ob_enable_trace_log = 1;

(2)  执行SQL

(3)  Show trace查看，然后SET ob_enable_trace_log =0 关闭

从展示结果上看其信息的直观性和可用性上不如tidb。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755719398.png)

 

## 十、遇到的问题

- **TiDB:**

(1)  执行计划中不显示不显示子查询的表信息，无法判断使用的扫描方式

该问题目前暂未完成修复: https://github.com/pingcap/tidb/issues/22076

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755734884.png)

oceanbase执行计划如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755740817.png)

- **OceanBase:**

(1)  对于子查询中不存在的列不会报错仍然继续执行

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755761421.png)

Tidb执行如下：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755769702.png)

(2)  Oceanbase无法使用索引

​按id列进行小范围查询时无法使用id列索引，执行手工合并后仍然是全表扫描执行计划。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755777590.png)

tidb执行计划：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755788829.png)

(3)  不同的index hint方式导致执行计划不同

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755798888.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755810587.png)

TIDB执行计划：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755817892.png)

 

(4)  explian展示的执行计划不能使用绑定后的Outline ，数据字典内记录的执行计划使用了索引

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755825083.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755833333.png)

Tidb执行计划：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755838184.png)

(5)  执行Prepare后会导致会话断开，再次执行后成功，对于交互式客户端oceanbase不支持显示查询结果。

​                                ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755845580.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755864615.png)

TiDB执行计划：

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755876339.png)

(6)  Obproxy可能会和多个后端observer建立连接，导致相同会话执行的慢SQL会被记录到多个observer的observer.log内(ob内使用数据字典查询慢SQL信息会更好些)。

​          ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1649755884394.png)



## 十一、总结

个人认为从功能上看oceanbase的执行计划管理要TiDB更丰富些，如SPM、ACS等，但从实际使用看无论是操作的复杂性、执行计划的可读性、优化器的可靠性都要由于oceanbase。Oceanbase在各方面在努力的向oracle兼容，比如系统视图、SPM管理、自适应游标共享、等待事件等，因架构不同、经验积累等和oracle比还是有着不小的差距。

针对TiDB建议如下:

(1)  执行计划绑定管理可以使用sql_digest、plan_digest等，可避免使用SQL语句

(2)  执行计划缓存做成全局管理方式，避免多个会话对相同SQL进行缓存，浪费内存空间

(3)  Explain analyze的execution info 在执行计划下面独立展示，否则执行计划太长不方便阅读。

