---
title: 复制 order 表的效率挑战 - TiDB 社区技术月刊
sidebar_label: 复制 order 表的效率挑战
hide_title: true
description: 本文将分享复制 order 表的效率挑战。TiDB 和 dumpling/tidb-lightning 的节点 CPU 数量都是 8，所以本次测试的单节点操作的并行度为 8。
keywords: [TiDB, order 表, 效率挑战, 阿里云]
---

# 复制 order 表的效率挑战

> 作者：[pepezzzz](https://tidb.net/u/pepezzzz/answer)

## 测试环境

### 阿里云集群配置

|                         | InstanceType   | 配置                            | 数量 |
| ----------------------- | -------------- | ----------------------------- | -- |
| PD Server               | ecs.c6.large   | 2CPU / 4GB 内存                 | 3  |
| TiDB Server             | ecs.c6.2xlarge | 8CPU / 16GB 内存                | 2  |
| TiKV Server             | ecs.i3.2xlarge | 8CPU / 64GB 内存 / 1920 GB NVMe | 4  |
| dumpling/tidb-lightning | ecs.i3.2xlarge | 8CPU / 64GB 内存 / 1920 GB NVMe | 1  |

TiDB 和 dumpling/tidb-lightning 的节点 CPU 数量都是 8，所以本次测试的单节点操作的并行度为 8。

## 数据环境

记录数

```SQL
MySQL [test_order]> select count(1) from test_order;
+----------+
| count(1) |
+----------+
| 30318907 |
+----------+
1 row in set (1.26 sec)
```

表结构

共 317 个字段和不含主键 11 个索引。

注：表名、库名、列名做过脱敏处理

```Shell
| oc_b_order | CREATE TABLE `test_order` (
  `id` bigint not null ,
  `zbill_no` varchar(50) not null ,
  `zsource_cod` varchar(60) default null ,
  `zab_d_shop_id` bigint(20) default null ,
  `zab_d_shop_ecod` varchar(50) default null,
  `zab_d_shop_title` varchar(100) default null,
  `zab_d_phy_wrhs_id` bigint(20) default '0',
  `zab_d_phy_wrhs_ecod` varchar(50) default null,
  `zab_d_phy_wrhs_enam` varchar(100) default null,
  `zab_d_customer_id` bigint(20) default null,
  `zab_d_customer_ecod` varchar(20) default null,
  `zab_d_customer_enam` varchar(50) default null,
  `zuser_id` bigint(20) default null,
  `zuser_nick` varchar(200) default null,
  `zorder_type` int(11) default null,
  `zorder_stat` int(11) default null,
  `zoccupy_stat` int(11) default null,
  `zsuffix_info` text default null,
  `zunique_key` varchar(200) default null,
  `zorder_flag` varchar(20) default null,
  `zproduct_amnt` decimal(18,4) default null,
  `zproduct_discount_amnt` decimal(18,4) default null,
  `zorder_discount_amnt` decimal(18,4) default null,
  `zadjust_amnt` decimal(18,4) default null,
  `zship_amnt` decimal(18,4) default null,
  `zservice_amnt` decimal(18,4) default null,
  `zorder_amnt` decimal(18,4) default null,
  `zreceived_amnt` decimal(18,4) default null,
  `zconsign_amnt` decimal(18,4) default null,
  `zconsign_ship_amnt` decimal(18,4) default null,
  `zamt_receive` decimal(18,4) default null,
  `zcod_amnt` decimal(18,4) default null,
  `zjd_receive_amnt` decimal(18,4) default null,
  `zjd_settle_amnt` decimal(18,4) default null,
  `zlogistics_cost` decimal(18,4) default null,
  `zor_inv` int(11) default null,
  `zinv_header` varchar(100) default null,
  `zinv_content` varchar(200) default null,
  `zor_geninv_notice` int(11) default '0',
  `zweight` decimal(18,4) default null,
  `zor_calcweight` int(11) default '0',
  `zab_d_logistics_id` bigint(20) default null,
  `zab_d_logistics_ecod` varchar(100) default null,
  `zab_d_logistics_enam` varchar(50) default null,
  `zexpresscode` varchar(100) default null,
  `zorder_date` datetime default null,
  `zend_tim` datetime default null,
  `zpay_tim` datetime default null,
  `zaudit_tim` datetime default null,
  `zbuyer_email` varchar(100) default null,
  `zreceiver_nam` varchar(700) default null,
  `zreceiver_mobile` varchar(500) default null,
  `zreceiver_phone` varchar(300) default null,
  `zab_d_region_province_id` bigint(20) default null,
  `zab_d_region_province_ecod` varchar(20) default null,
  `zab_d_region_province_enam` varchar(100) default null,
  `zab_d_region_city_id` bigint(20) default null,
  `zab_d_region_city_ecod` varchar(20) default null,
  `zab_d_region_city_enam` varchar(100) default null,
  `zab_d_region_area_id` bigint(20) default null,
  `zab_d_region_area_ecod` varchar(20) default null,
  `zab_d_region_area_enam` varchar(100) default null,
  `zab_d_region_town_enam` varchar(100) default null,
  `zreceiver_address` varchar(1000) default null,
  `zreceiver_zip` varchar(50) default null,
  `zreceiver_email` varchar(200) default null,
  `zor_cancel_merge` int(11) default '0',
  `zor_merge` int(11) default '0',
  `zor_split` int(11) default '0',
  `zwms_stat` int(11) default null,
  `zor_interecept` int(11) default '0',
  `zor_inreturning` int(11) default '0',
  `zsalesman_id` bigint(20) default null,
  `zsalesman_nam` varchar(100) default null,
  `zall_sku` varchar(500) default null,
  `zpay_type` int(11) default null,
  `zbuyer_message` varchar(500) default null,
  `zorder_source` varchar(200) default null,
  `zorig_order_id` bigint(20) default null,
  `zorig_return_order_id` bigint(20) default null,
  `zor_hasgift` int(11) default '0',
  `zqty_all` decimal(18,4) default null,
  `zsku_kind_qty` decimal(18,4) default null,
  `zsysremark` varchar(600) default null,
  `zinside_remark` varchar(600) default null,
  `zseller_memo` varchar(1000) default null,
  `zmerge_source_cod` text default null,
  `zplatform` int(11) default null,
  `zmerge_order_id` bigint(20) default null,
  `zsplit_order_id` bigint(20) default null,
  `zscan_tim` datetime default null,
  `zout_stat` int(11) default null,
  `ztid` varchar(200) default null,
  `zorder_tag` varchar(100) default null,
  `zwms_cancel_stat` int(11) default null,
  `zreturn_stat` int(11) default '0',
  `ztb_storecode` varchar(200) default null,
  `zrefund_confirm_stat` int(11) default null,
  `zauto_audit_stat` int(11) default null,
  `zor_jcorder` int(11) default '0',
  `zdouble11_presale_stat` int(11) default '0',
  `zdistribution_tim` datetime default null,
  `zor_invented` int(11) default '0',
  `zor_combination` int(11) default '0',
  `zor_out_urgency` int(11) default '0',
  `zor_shop_commission` int(11) default '0',
  `zor_has_ticket` int(11) default '0',
  `zversion` bigint(20) default null,
  `zad_org_id` bigint(20) default '27',
  `zad_client_id` bigint(20) default '37',
  `zownerid` bigint(20) default null,
  `zownerenam` varchar(50) default null,
  `zownernam` varchar(50) default null,
  `zcreationdate` datetime default current_timstamp,
  `zmodifierid` bigint(20) default null,
  `zmodifierenam` varchar(50) default null,
  `zmodifiernam` varchar(50) default null,
  `zmodifieddate` datetime not null default current_timstamp on update current_timstamp,
  `zisactive` char(1) default 'y',
  `zalipay_no` varchar(50) default null,
  `zbuyer_alipay_no` varchar(50) default null,
  `zab_d_shop_seller_nick` varchar(100) default null,
  `zor_force` bigint(20) default '2',
  `zor_overfive` bigint(20) default '0',
  `zor_exchange_no_in` bigint(20) default '0',
  `zor_multi_pack` bigint(20) default '0',
  `zmakeup_fail_num` bigint(20) default '0',
  `zlock_stat` int(11) default null,
  `zpos_bill_id` bigint(20) default null,
  `zamt_plat_discount` decimal(18,4) default null,
  `zforce_send_fail_reason` varchar(200) default null,
  `zprice_label` varchar(200) default null,
  `zstatus_pay_step` varchar(200) default null,
  `zab_d_label_enam` varchar(50) default null,
  `zab_d_label_content` varchar(500) default null,
  `zinv_stat` int(11) default null,
  `ztest_inv_notice_id` mediumtext default null,
  `zscalping_type` int(11) default null,
  `zpresale_deposit_tim` datetime default null,
  `zab_d_label_id` bigint(20) default null,
  `zsg_b_out_bill_no` varchar(20) default null,
  `zout_type` int(1) default null,
  `zcainiao_wh_stat` varchar(50) default null,
  `zpay_stat` int(10) default null,
  `zpltfm_stat` varchar(30) default null,
  `zdlvytime` datetime default null,
  `zexpected_dlvytime` datetime default null,
  `zdlvy_method` varchar(50) default null,
  `zlabel_tim` varchar(100) default null,
  `zrefund_stat` int(10) default null,
  `zcancel_stat` varchar(50) default null,
  `zred_enveloper` decimal(10,0) default null,
  `zinternal_memo` varchar(50) default null,
  `zrefund_fee` decimal(18,4) default null,
  `zorder_weight` decimal(18,4) default null,
  `zorder_gross` decimal(18,4) default null,
  `zsingle_quantity` decimal(18,4) default null,
  `zsingle_number` decimal(18,4) default null,
  `zwms_bill_no` varchar(100) default null,
  `zreissue_note` varchar(50) default null,
  `ztarget_cod` varchar(50) default null,
  `zaudit_failed_type` int(10) default '0',
  `zor_o2o_order` int(10) default null,
  `zpresell_type` int(10) default null,
  `zpresell_way` int(10) default null,
  `zcopy_reason` varchar(64) default null,
  `zlive_platform` varchar(5) default null,
  `zlive_flag` int(11) default null,
  `zanchor_id` varchar(30) default null,
  `zanchor_nam` varchar(64) default null,
  `zor_out_stock_split` int(10) default null,
  `zor_dlvy_urgent` tinyint(1) default '0',
  `zcopy_num` int(11) default '0',
  `zor_lose_copy_order` int(11) default '0',
  `zor_copy_order` tinyint(1) default '0',
  `zor_reset_ship` tinyint(1) default '0',
  `zor_modified_order` tinyint(1) default '0',
  `zvip_workflow_sn` varchar(50) default null,
  `zor_vip_update_wrhs` int(2) default null,
  `zdispute_id` bigint(20) default null,
  `zhold_release_tim` datetime default null,
  `zor_history` char(1) default 'n',
  `zqty_split` bigint(20) default '0',
  `zor_prom_order` tinyint(1) default '0',
  `zor_real_lackstock` tinyint(1) default '0',
  `zor_extra` int(11) default '0',
  `zor_same_city_purchase` int(11) default '0',
  `zstore_dlvy_stat` int(11) default null,
  `zdlvy_store_id` bigint(20) default null,
  `zdlvy_store_cod` varchar(100) default null,
  `zdlvy_store_nam` varchar(150) default null,
  `zoffline_order_cod` varchar(100) default null,
  `zpos_orderno` varchar(10) default null,
  `zor_spilt_sku_style` int(11) default '0',
  `zmerge_error_num` int(11) default null,
  `zto_sap_stat` tinyint(1) default '0',
  `zsplit_stat` int(11) default '0',
  `zsplit_reason` int(11) default '0',
  `zr_bigint01` bigint(20) default null,
  `zr_bigint02` bigint(20) default null,
  `zr_bigint03` bigint(20) default null,
  `zr_bigint04` bigint(20) default null,
  `zr_bigint05` bigint(20) default '0',
  `zr_decimal01` decimal(18,4) default null,
  `zr_decimal02` decimal(18,4) default null,
  `zr_decimal03` decimal(18,4) default null,
  `zr_decimal04` decimal(18,4) default null,
  `zr_decimal05` decimal(18,4) default null,
  `zr_varchar01` varchar(20) default null,
  `zr_varchar02` varchar(20) default null,
  `zr_varchar03` varchar(50) default null,
  `zr_varchar04` varchar(50) default null,
  `zaudit_failed_reason` varchar(100) default null,
  `zreverse_audit_type` varchar(100) default null,
  `zr_varchar05` varchar(50) default null,
  `zwms_cancel_number` int(10) unsigned default '0',
  `zr_audit_tag` varchar(20) default null,
  `zor_to_sap` int(2) default '1',
  `zorder_ecypt_cod` varchar(50) default null,
  `zac_f_manage_id` bigint(20) default null,
  `zac_f_manage_ecod` varchar(50) default null,
  `zac_f_manage_enam` varchar(50) default null,
  `zcooperate_id` bigint(20) default null,
  `zcooperate_ecod` varchar(50) default null,
  `zcooperate_enam` varchar(50) default null,
  `zlive_events` bigint(20) default null,
  `zorder_discount` decimal(18,4) default null,
  `zjitx_requires_dlvy_wrhs_id` bigint(20) default null,
  `zjitx_requires_dlvy_wrhs_cod` varchar(255) default null,
  `zjitx_requires_dlvy_wrhs_nam` varchar(255) default null,
  `zsuggest_prepackage_stat` char(1) default null,
  `zactual_prepackage_stat` char(1) default null,
  `zsuggest_presink_stat` char(1) default null,
  `zactual_presink_stat` char(1) default null,
  `zsplit_reason_id` bigint(20) default null,
  `zcustom_reason` varchar(50) default null,
  `zmerged_cod` varchar(255) default null,
  `zmerged_sn` varchar(255) default null,
  `zjitx_requires_merge` char(1) default null,
  `zjitx_merged_dlvy_sn` varchar(255) default null,
  `zor_forbidden_dlvy` int(2) default null,
  `zadvance_type` varchar(50) default null,
  `zor_self_pick_up` char(1) default '0',
  `zor_detention` int(11) default '0',
  `zbasic_price_used` decimal(10,2) default null,
  `zexpand_price_used` decimal(10,2) default null,
  `zto_drp_stat` char(1) default '0',
  `zto_drp_count` int(2) default '0',
  `zto_drp_failed_reason` varchar(255) default null,
  `zoaid` varchar(200) default null,
  `zsg_b_out_bill_id` bigint(20) default null,
  `zsto_out_bill_no` varchar(50) default null,
  `zpltfm_dlvy_tim` datetime default null,
  `zwrhs_dlvy_tim` datetime default null,
  `zthird_party_fail_stat` char(2) default null,
  `zhold_reason` varchar(100) default null,
  `zdetention_reason` varchar(50) default null,
  `zab_e_custom_label_id` varchar(100) default null,
  `zab_e_custom_label_enam` varchar(300) default null,
  `zdetention_date` datetime default null,
  `zdetention_release_date` datetime default null,
  `zstock_occupy_date` datetime default null,
  `zoccupy_success_date` datetime default null,
  `zhold_date` datetime default null,
  `zhold_release_date` datetime default null,
  `zaudit_type` varchar(50) default null,
  `zaudit_success_date` datetime default null,
  `zcancel_date` datetime default null,
  `zexamine_order_date` datetime default null,
  `zuse_coupon_no` varchar(50) default null,
  `zhold_release_reason` varchar(50) default null,
  `zhold_release_nam` varchar(50) default null,
  `zor_notice_dlvy` char(1) default '0',
  `zdlvy_in_stat` char(1) default '0',
  `zor_store_dlvy` int(1) default null,
  `zgw_vip_cod` varchar(50) default null,
  `zgw_vip_mobile` varchar(30) default null,
  `zgw_source_cod` varchar(50) default null,
  `zgw_source_group` varchar(50) default null,
  `zestimate_con_tim` datetime default null,
  `zout_wms_receive_tim` datetime default null,
  `zlogistics_stat` varchar(50) default null,
  `zonroad_date` datetime default null,
  `zonroad_transfer_date` datetime default null,
  `zarrived_date` datetime default null,
  `zpltfm_province` varchar(20) default null,
  `zpltfm_city` varchar(20) default null,
  `zpltfm_area` varchar(20) default null,
  `zsap_arrived_date` date default null,
  `zbusi_type` varchar(50) default null,
  `zbusi_type_id` bigint(20) default null,
  `zbusi_type_nam` varchar(50) default null,
  `zbusi_type_cod` varchar(50) default null,
  `zorder_source_pltfm_ecod` varchar(200) default null,
  `zsource_bill_no` varchar(20) default null,
  `zto_naika_stat` int(10) default '0',
  `zwhether_need_receipt` char(1) default null,
  `zreceipt_date` datetime default null,
  `zsales_organization_id` bigint(20) default null,
  `zsales_department_id` bigint(20) default null,
  `zcost_center_id` bigint(20) default null,
  `zfactory` varchar(50) default null,
  `zexpiry_date_type` int(5) default null,
  `zexpiry_date_range` varchar(200) default null,
  `zor_equal_exchange` int(5) default '0',
  `zor_out_stock` int(5) default null,
  `zor_express` char(1) default 'n',
  `zcurrent_cycle_number` int(11) default null,
  `zor_encrypted` int(10) default null,
  `zsales_department_nam` varchar(100) default null,
  `zaudit_id` bigint(20) default null,
  `zor_occupy_stock_fail` int(2) default null,
  `zaudit_nam` varchar(20) default null,
  `zor_manual_addr` int(11) default '0',
  `zor_exception` varchar(10) default null,
  `zexcpt_type` varchar(10) default null,
  `zexcpt_explain` varchar(100) default null,
  PRIMARY KEY (`id`) /*T![clustered_index] NONCLUSTERED */,
  UNIQUE KEY `zgsi_test_order_merge_encrypt_cod` (`zorder_ecypt_cod`,`zid`,`zab_d_shop_id`,`zorder_stat`,`zorder_date`,`zor_interecept`,`zor_inreturning`,`zpay_type`,`zplatform`,`zor_same_city_purchase`),
  KEY `zi_test_order_03` (`ztid`),
  KEY `zi_test_order_04` (`zexpresscode`),
  KEY `zi_test_order_05` (`zorder_stat`),
  KEY `zi_test_order_06` (`zuser_nick`),
  KEY `zi_test_order_07` (`zab_d_phy_wrhs_id`),
  KEY `zi_test_order_08` (`zr_varchar04`),
  KEY `zbill_no` (`zbill_no`),
  KEY `zindex_orgi_return_id` (`zorig_return_order_id`),
  KEY `zi_test_order_02` (`zsource_cod`,`zid`),
  KEY `zidx1` (`zscan_tim`,`zcreationdate`,`zab_d_shop_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci /*T! SHARD_ROW_ID_BITS=2 */ |
```

## 方法一：非事务 DML 语句

### 非事务 DML 语句介绍

非事务 DML 语句是将一个普通 DML 语句拆成多个 SQL 语句（即多个 batch）执行，以牺牲事务的原子性和隔离性为代价，增强批量数据处理场景下的性能和易用性。v6.1 支持 delete 语句的 batch 语法，v6.4 支持 update 和 insert select 语句的 batch 语法。

使用 batch dry run 语法可以看到第一个子任务和最后一个子任务的语句。

```Shell
MySQL [test_order]> batch on id limit 1000 dry run insert into test_order_target select * from test_order;
+-------------------------------------------------------------------------------------------------------------------------------------+
| split statement examples                                                                                                            |
+-------------------------------------------------------------------------------------------------------------------------------------+
| INSERT INTO `test_order`.`test_order_target` SELECT * FROM `test_order`.`test_order` WHERE `id` BETWEEN 5 AND 100902            |
| INSERT INTO `test_order`.`test_order_target` SELECT * FROM `test_order`.`test_order` WHERE `id` BETWEEN 119960228 AND 119961136 |
+-------------------------------------------------------------------------------------------------------------------------------------+
2 rows in set (9.78 sec)
```

### 单次 1000 行插入原表

```SQL
MySQL [test_order]> batch on id limit 1000 insert into test_order_target select * from test_order;
```

从 CLUSTER\_PROCESSLIST 表和 tidb.log 日志上可以看到执行进度。

CLUSTER\_PROCESSLIST 的 query 列如下：

/\* job 20579/30319 \*/ INSERT INTO \`test\_order\`.\`test\_order\_target\` SELECT \* FROM \`test\_order\`.\`test\_order\` WHERE \`id\` BETWEEN 110190802 AND 110191803

tidb.log 日志的第一个和最后一个子任务如下：

\[2022/12/30 09:45:53.436 +08:00] \[INFO] \[nontransactional.go:423] \["start a Non-transactional DML"] \[conn=3074535777447707195] \[job="**job id: 1**, estimated size: 1000, sql: INSERT INTO \`test\_order\`.\`test\_order\_target\` SELECT \* FROM \`test\_order\`.\`test\_order\` WHERE \`id\` BETWEEN 5 AND 100902"] \[**totalJobCount=30319**]

\[2022/12/30 12:05:55.725 +08:00] \[INFO] \[nontransactional.go:445] \["Non-transactional DML SQL finished successfully"] \[conn=3074535777447707195] \[**jobID=30319**] \[jobSize=907] \[dmlSQL="INSERT INTO \`test\_order\`.\`test\_order\_target\` SELECT \* FROM \`test\_order\`.\`test\_order\` WHERE \`id\` BETWEEN 119960228 AND 119961136"]

累计执行时间是 2 小时 20 分钟。

插入原表期间 tidb-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389492.png)

delete 语句的 batch 语法是单会话串行执行，保持在 100%。

插入原表期间 tikv-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389601.png)

空间占用监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658388982.png)

空间占用约 85.6 GB（导入的平台数据文件约 63 GB )

### 单次 200 行插入原表

调整单次复制行数为 200，查看复制的效率变化。

```SQL
MySQL [test_order]> batch on id limit 200 insert into test_order_target2 select * from test_order;
+----------------+---------------+
| number of jobs | job status    |
+----------------+---------------+
|         151595 | all succeeded |
+----------------+---------------+
1 row in set (2 hours 40 min 10.55 sec)

MySQL [test_order]> select count(1) from test_order_target2;
+----------+
| count(1) |
+----------+
| 30318907 |
+----------+
1 row in set (2.01 sec)
```

### 单次 200 行插入无索引表

删除目标表的索引，查看复制的效率变化。

```SQL
-- 提前准备无索引表 test_order_target3 
MySQL [test_order]> create table test_order_target3 like test_order;
MySQL [test_order]> alter table test_order_target3 drop index   `gsi_test_order_target3_merge_encrypt_code` ;
...
MySQL [test_order]> alter table test_order_target3 drop index   `idx1` ;
MySQL [test_order]> batch on id limit 200 insert into test_order_target3 select * from test_order;
+----------------+---------------+
| number of jobs | job status    |
+----------------+---------------+
|         151595 | all succeeded |
+----------------+---------------+
1 row in set (1 hour 53 min 23.39 sec)
```

### 非事务 DML 语句效率

|               | 时间                    | TiDB CPU   | TiKV CPU | 备注 |
| ------------- | --------------------- | ---------- | -------- | -- |
| 单次 1000 行插入原表 | 2 hours 20 min        | 会话节点：100 % | < 300%   |    |
| 单次 200 行插入原表  | 2 hours 40 min 10 sec | 会话节点：100 % | < 300%   |    |
| 单次 200 行插入无索引 | 1 hour 53 min 23 sec  |            |          |    |

## 方法二：非事务 DML 语句后再建索引

### 索引加速功能

TiDB v6.3.0 版本增加索引加速功能，并在 v6.5.0 版本进一步完成性能优化。新特性主要提升创建索引过程中在 write reorg 阶段的速度，实现机制是多次取表数据在本地构造索引数据完成排序后，通过 ingest 的方式保存到 TiKV 的 RocksDB 上，取代原有需要经过事务层处理的写入方式，新特性加索引的速度可以提升 10 倍左右。

```SQL
MySQL [(none)]> show variables like "%tidb_ddl_enable_fast_reorg%";
+----------------------------+-------+
| Variable_name              | Value |
+----------------------------+-------+
| tidb_ddl_enable_fast_reorg | ON    |
+----------------------------+-------+
1 row in set (0.00 sec)
-- 核对 tidb_ddl_enable_fast_reorg 变量。v6.5.0 版本默认打开，低版本升级需要手工打开。
MySQL [(none)]> show config where name like "%temp-dir%";
+------+--------------------+----------+---------------------------------+
| Type | Instance           | Name     | Value                           |
+------+--------------------+----------+---------------------------------+
| tidb | 192.168.48.32:4000 | temp-dir | /tidb-deploy/tidb-4000/temp-dir |
| tidb | 192.168.48.31:4000 | temp-dir | /tidb-deploy/tidb-4000/temp-dir |
+------+--------------------+----------+---------------------------------+
-- 需要提前使用 tiup cluster edit-config 配置 temp-dir 目录，用于索引数据 ingest 前的数据准备。
```

要验证正在进行或者已经完成的 ADD INDEX 操作是原有的事务方式或索引加速功能，可以执行 ADMIN SHOW DDL JOBS 语句查看 JOB\_TYPE 一列中是 txn 或 ingest 关键字。

输出举例如下：

```SQL
MySQL [test_order]> admin show ddl jobs;
+--------+--------------+--------------------+---------------------+--------------+-----------+----------+-----------+---------------------+---------------------+---------------------+--------+
| JOB_ID | DB_NAME      | TABLE_NAME         | JOB_TYPE            | SCHEMA_STATE | SCHEMA_ID | TABLE_ID | ROW_COUNT | CREATE_TIME         | START_TIME          | END_TIME            | STATE  |
+--------+--------------+--------------------+---------------------+--------------+-----------+----------+-----------+---------------------+---------------------+---------------------+--------+
|   5503 | test_order   | test_order_target3 | add index /* txn */ | public       |        70 |     5388 |  30318907 | 2023-01-01 21:10:45 | 2023-01-01 21:10:45 | 2023-01-01 21:26:14 | synced |
...
|   5461 | test_order   | test_order_target3 | add index /*ingest*/| public       |        70 |     5388 |  30318907 | 2022-12-31 09:51:19 | 2022-12-31 09:51:19 | 2022-12-31 09:53:30 | synced |
```

从 START\_TIME 和 END\_TIME 两个时间相减也可以看出相同的索引语句（第一个 7 列的组合唯一索引）的效率对比：

| 创建方式        | START\_TIME         | END\_TIME           | 执行时长          |
| ----------- | ------------------- | ------------------- | ------------- |
| Txn 事务方式    | 2023-01-01 21:10:45 | 2023-01-01 21:26:14 | 15 min 30 sec |
| Ingest 索引加速 | 2022-12-31 09:51:19 | 2022-12-31 09:53:30 | 2 min 11 sec  |

### 使用默认的索引参数建索引

基于索引加速功能，将索引创建阶段移到数据导入后，利用并行功能进行提速。

索引并行参数如下：

```SQL
MySQL [(none)]> show variables like "%tidb_ddl_reorg_%";
tidb_ddl_reorg_batch_size        256
tidb_ddl_reorg_priority        PRIORITY_LOW
tidb_ddl_reorg_worker_cnt        4
```

索引脚本如下：

```SQL
# cat addindex.sql 
alter table test_order_target3 add  UNIQUE index `gsi_test_order_target3_merge_encrypt_code` (`zorder_encryption_code`,`id`,`zab_d_shop_id`,`zorder_status`,`zorder_date`,`zor_interecept`,`zor_inreturning`,`zpay_type`,`zplatform`,`zor_same_city_purchase`);
alter table test_order_target3 add index   `i_test_order_target3_03` (`ztid`);
alter table test_order_target3 add index   `i_test_order_target3_04` (`zexpresscode`);
alter table test_order_target3 add index   `i_test_order_target3_05` (`zorder_status`);
alter table test_order_target3 add index   `i_test_order_target3_06` (`zuser_nick`);
alter table test_order_target3 add index   `i_test_order_target3_07` (`zab_d_phy_warehouse_id`);
alter table test_order_target3 add index   `i_test_order_target3_08` (`zr_varchar04`);
alter table test_order_target3 add index   `bill_no` (`zbill_no`);
alter table test_order_target3 add index   `index_orgi_return_id` (`zorig_return_order_id`);
alter table test_order_target3 add index   `i_test_order_target3_02` (`zsource_code`,`id`);
alter table test_order_target3 add index   `idx1` (`zscan_time`,`zcreationdate`,`zab_d_shop_id`);
```

索引效率如下：

```SQL
MySQL [test_order]> source addindex.sql;
Query OK, 0 rows affected (3 min 10.56 sec)

Query OK, 0 rows affected (52.99 sec)

Query OK, 0 rows affected (47.40 sec)

Query OK, 0 rows affected (47.31 sec)

Query OK, 0 rows affected (1 min 0.54 sec)

Query OK, 0 rows affected (49.29 sec)

Query OK, 0 rows affected (49.81 sec)

Query OK, 0 rows affected (47.74 sec)

Query OK, 0 rows affected (49.61 sec)

Query OK, 0 rows affected (1 min 1.60 sec)

Query OK, 0 rows affected (50.34 sec)
```

创建索引期间 tidb-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389564.png)

会话节点的 CPU 最高是 400%，与 tidb\_ddl\_reorg\_worker\_cnt:4 能大致对应。

创建索引期间 tikv-server 的 CPU 监控如下

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389528.png)

## 使用优化的索引参数建索引

```SQL
MySQL [test_order]> set global tidb_ddl_reorg_batch_size=2048;
MySQL [test_order]> set global tidb_ddl_reorg_worker_cnt =8;
MySQL [test_order]> show variables like "%tidb_ddl_reorg_%";
+---------------------------+--------------+
| Variable_name             | Value        |
+---------------------------+--------------+
| tidb_ddl_reorg_batch_size | 2048         |
| tidb_ddl_reorg_priority   | PRIORITY_LOW |
| tidb_ddl_reorg_worker_cnt | 8            |
+---------------------------+--------------+
3 rows in set (0.00 sec)
```

索引效率如下：

```SQL
MySQL [test_order]> source addindex.sql;
Query OK, 0 rows affected (5 min 15.26 sec)

Query OK, 0 rows affected (45.11 sec)

Query OK, 0 rows affected (39.40 sec)

Query OK, 0 rows affected (47.54 sec)

Query OK, 0 rows affected (47.30 sec)

Query OK, 0 rows affected (41.06 sec)

Query OK, 0 rows affected (41.89 sec)

Query OK, 0 rows affected (38.81 sec)

Query OK, 0 rows affected (41.10 sec)

Query OK, 0 rows affected (51.20 sec)

Query OK, 0 rows affected (39.34 sec)
```

第一个索引的创建过程中，出现 TiKV 写入的多次尝试，需要修改 region scatter 策略重新尝试。

\[2022/12/30 23:36:04.826 +08:00] \[WARN] \[localhelper.go:463] \["wait for scatter region encountered error, will retry again"] \[region="{ID=67262,startKey=74800...00F8,endKey=74800...00F8,epoch=\\"conf\_ver:359 version:3151 \\",peers=\\"id:67263 store\_id:7 ,id:67264 store\_id:2 ,id:67265 store\_id:1 \\"}"] \[error="rpc error: code = Unknown desc = region 67262 is not fully replicated"]

修改 tidb\_scatter\_region 变量。

```SQL
MySQL [test_order]> set global tidb_scatter_region=1;
MySQL [test_order]> show variables like "%scatter%";
+---------------------+-------+
| Variable_name       | Value |
+---------------------+-------+
| tidb_scatter_region | ON    |
+---------------------+-------+
1 row in set (0.00 sec)
```

重新创建的索引效率如下：

```SQL
MySQL [test_order]> source addindex.sql
Query OK, 0 rows affected (2 min 11.91 sec)

Query OK, 0 rows affected (42.54 sec)

Query OK, 0 rows affected (37.19 sec)

Query OK, 0 rows affected (38.36 sec)

Query OK, 0 rows affected (53.19 sec)

Query OK, 0 rows affected (38.97 sec)

Query OK, 0 rows affected (41.03 sec)

Query OK, 0 rows affected (37.02 sec)

Query OK, 0 rows affected (38.45 sec)

Query OK, 0 rows affected (49.79 sec)

Query OK, 0 rows affected (40.30 sec)
```

创建索引期间 tidb-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658388998.png)

会话节点的 CPU 最高是 689%，与 tidb\_ddl\_reorg\_worker\_cnt:8 能大致对应。

创建索引期间 tikv-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389578.png)

### 复制数据后再建索引效率记录

|                    | 时间                                                                                      | TiDB CPU  | TiKV CPU        | 备注                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------- | --------- | --------------- | ---------------------------------------------------------------------------------------- |
| 默认参数               | 3 min 10 sec52 sec47 sec47 sec1 min49 sec49 sec47 sec49 sec1 min 1 sec50 sec共计：约 12 min | 会话节点：382% | 平均约 200%高峰 350% | tidb\_ddl\_reorg\_batch\_size:256tidb\_ddl\_reorg\_worker\_cnt:4                         |
| 优化参数               | 2 min 11 sec42 sec37 sec38 sec53 sec38 sec41 sec37 sec38 sec49 sec40 sec共计：9 min        | 会话节点：689% | 平均约 250%高峰 350% | tidb\_ddl\_reorg\_batch\_size:2048tidb\_ddl\_reorg\_worker\_cnt:8tidb\_scatter\_region:1 |
| 无索引数据复制加优化参数索引加速总计 | 2 hour 2 min 23 sec                                                                     |           |                 | 复用插入无索引表成绩&#x20;1 hour 53 min 23 sec                                                     |

## 方法三：导出后再导入

### 数据导出

使用 dumpling 工具以 8 线程备份单表数据，导出的数据文件 63 GB。

```Shell
# ./dumpling -u root -P 4000 -h 192.168.48.23 --filter "test_order.test_order" --filetype sql -t 8 -o /data1/order-data/ -r 1000000 -F256MiB
...
[2022/12/31 10:10:26.697 +08:00] [INFO] [versions.go:54] ["Welcome to dumpling"] ["Release Version"=v6.5.0] ["Git Commit Hash"=706c3fa3c526cdba5b3e9f066b1a568fb96c56e3] ["Git Branch"=heads/refs/tags/v6.5.0] ["Build timestamp"="2022-12-27 03:43:05"] ["Go Version"="go version go1.19.3 linux/amd64"]
...
[2022/12/31 10:10:26.719 +08:00] [INFO] [dump.go:131] ["begin to run Dump"] [conf="{\"s3\":{\"endpoint\":\"\",\"region\":\"\",\"storage-class\":\"\",\"sse\":\"\",\"sse-kms-key-id\":\"\",\"acl\":\"\",\"access-key\":\"\",\"secret-access-key\":\"\",\"provider\":\"\",\"force-path-style\":true,\"use-accelerate-endpoint\":false,\"role-arn\":\"\",\"external-id\":\"\",\"object-lock-enabled\":false},\"gcs\":{\"endpoint\":\"\",\"storage-class\":\"\",\"predefined-acl\":\"\",\"credentials-file\":\"\"},\"azblob\":{\"endpoint\":\"\",\"account-name\":\"\",\"account-key\":\"\",\"access-tier\":\"\"},\"AllowCleartextPasswords\":false,\"SortByPk\":true,\"NoViews\":true,\"NoSequences\":true,\"NoHeader\":false,\"NoSchemas\":false,\"NoData\":false,\"CompleteInsert\":false,\"TransactionalConsistency\":true,\"EscapeBackslash\":true,\"DumpEmptyDatabase\":true,\"PosAfterConnect\":false,\"CompressType\":0,\"Host\":\"192.168.48.23\",\"Port\":4000,\"Threads\":8,\"User\":\"root\",\"Security\":{\"CAPath\":\"\",\"CertPath\":\"\",\"KeyPath\":\"\"},\"LogLevel\":\"info\",\"LogFile\":\"\",\"LogFormat\":\"text\",\"OutputDirPath\":\"/data1/order-data/\",\"StatusAddr\":\":8281\",\"Snapshot\":\"438423421374169090\",\"Consistency\":\"snapshot\",\"CsvNullValue\":\"\\\\N\",\"SQL\":\"\",\"CsvSeparator\":\",\",\"CsvDelimiter\":\"\\\"\",\"Databases\":[],\"Where\":\"\",\"FileType\":\"sql\",\"ServerInfo\":{\"ServerType\":3,\"ServerVersion\":\"6.5.0\",\"HasTiKV\":true},\"Rows\":1000000,\"ReadTimeout\":900000000000,\"TiDBMemQuotaQuery\":0,\"FileSize\":268435456,\"StatementSize\":1000000,\"SessionParams\":{\"tidb_snapshot\":\"438423421374169090\"},\"Tables\":{},\"CollationCompatible\":\"loose\"}"]
...
[2022/12/31 10:15:27.360 +08:00] [INFO] [collector.go:255] ["backup success summary"] [total-ranges=701] [ranges-succeed=701] [ranges-failed=0] [total-take=5m0.498002713s] [total-kv-size=67.46GB] [average-speed=224.5MB/s] [total-rows=30318907]
...
# du -sh /data1/order-data/
63G     /data1/order-data/
```

导出期间 tidb-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389495.png)

导出期间 tikv-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389098.png)

### 数据准备

批量重命名导出文件，重命名的脚本如下：

```Shell
[order-data]# cat rename_batch.sh 
#!/bin/bash
for file in `ls dbname.tablename*`
do
echo $file
newFile=`echo $file | sed 's/dbname.tablename/new_dbname.new_tablename/g'`
echo $newFile
#mv $file $newFile
done
```

文件改名前后的对比输出如下：

```Shell
test_order.test_order.0000006780000.sql
test_order_target.test_order_target2.0000006780000.sql
test_order.test_order-schema.sql
test_order_target.test_order_target2-schema.sql
```

确认文件名符合要求后，使用 rename\_batch.sh 生成真正改名的 mv\_batch.sh 并执行。

```Shell
[order-data]# cat rename_batch.sh 
#!/bin/bash
for file in `ls dbname.tablename*`
do
#echo $file
newFile=`echo $file | sed 's/dbname.tablename/new_dbname.new_tablename/g'`
#echo $newFile
mv $file $newFile
done
[order-data]# sh rename_batch.sh > mv_batch.sh
[order-data]# sh mv_batch.sh
```

### 数据导入

使用 tidb-lightning 工具以 8 并行工作线程以 local 方式导入单表 63 GB 数据文件，包含所有索引。

创建 toml 配置文件如下：

```TOML
[lightning]
level = "info"
file = "tidb-lightning-order.log"
check-requirements = true
region-concurrency = 8
[tikv-importer]
backend = "local"
on-duplicate = "error"
sorted-kv-dir = "/data1/sorted/order/"
[checkpoint]
enable = true
schema = "tidb_lightning_ckp_order"
driver = "file"
[mydumper]
data-source-dir = "/data1/order-data/"
[tidb]
host = "192.168.48.31"
port = 4000
user = "root"
password = ""
pd-addr = "192.168.48.25:2379"
status-port = 10080
[post-restore]
checksum = true
analyze = false
```

执行 tidb-lightning

```Shell
#./tidb-lightning --config  light-order.toml
...
[2022/12/31 19:10:25.432 +08:00] [INFO] [lightning.go:382] [cfg] [cfg="{\"id\":1672485025432262754,\"lightning\":{\"table-concurrency\":6,\"index-concurrency\":2,\"region-concurrency\":8,\"io-concurrency\":5,\"check-requirements\":true,\"meta-schema-name\":\"lightning_metadata\",\"max-error\":{\"type\":0},\"task-info-schema-name\":\"lightning_task_info\"},\"tidb\":{\"host\":\"192.168.48.31\",\"port\":4000,\"user\":\"root\",\"status-port\":10080,\"pd-addr\":\"192.168.48.25:2379\",\"sql-mode\":\"ONLY_FULL_GROUP_BY,NO_AUTO_CREATE_USER\",\"tls\":\"false\",\"security\":{\"ca-path\":\"\",\"cert-path\":\"\",\"key-path\":\"\",\"redact-info-log\":false},\"max-allowed-packet\":67108864,\"distsql-scan-concurrency\":15,\"build-stats-concurrency\":20,\"index-serial-scan-concurrency\":20,\"checksum-table-concurrency\":2,\"vars\":null},\"checkpoint\":{\"schema\":\"tidb_lightning_ckp_order\",\"driver\":\"file\",\"enable\":true,\"keep-after-success\":\"remove\"},\"mydumper\":{\"read-block-size\":65536,\"batch-size\":0,\"batch-import-ratio\":0,\"source-id\":\"\",\"data-source-dir\":\"file:///data1/order-data\",\"character-set\":\"auto\",\"csv\":{\"separator\":\",\",\"delimiter\":\"\\\"\",\"terminator\":\"\",\"null\":\"\\\\N\",\"header\":true,\"trim-last-separator\":false,\"not-null\":false,\"backslash-escape\":true},\"max-region-size\":268435456,\"filter\":[\"*.*\",\"!mysql.*\",\"!sys.*\",\"!INFORMATION_SCHEMA.*\",\"!PERFORMANCE_SCHEMA.*\",\"!METRICS_SCHEMA.*\",\"!INSPECTION_SCHEMA.*\"],\"files\":null,\"no-schema\":false,\"case-sensitive\":false,\"strict-format\":false,\"default-file-rules\":true,\"ignore-data-columns\":null,\"data-character-set\":\"binary\",\"data-invalid-char-replace\":\"�\"},\"tikv-importer\":{\"addr\":\"\",\"backend\":\"local\",\"on-duplicate\":\"error\",\"max-kv-pairs\":4096,\"send-kv-pairs\":32768,\"region-split-size\":0,\"region-split-keys\":0,\"sorted-kv-dir\":\"/data1/sorted/order/\",\"disk-quota\":9223372036854775807,\"range-concurrency\":16,\"duplicate-resolution\":\"none\",\"incremental-import\":false,\"engine-mem-cache-size\":536870912,\"local-writer-mem-cache-size\":134217728,\"store-write-bwlimit\":0},\"post-restore\":{\"checksum\":\"required\",\"analyze\":\"off\",\"level-1-compact\":false,\"post-process-at-last\":true,\"compact\":false},\"cron\":{\"switch-mode\":\"5m0s\",\"log-progress\":\"5m0s\",\"check-disk-quota\":\"1m0s\"},\"routes\":null,\"security\":{\"ca-path\":\"\",\"cert-path\":\"\",\"key-path\":\"\",\"redact-info-log\":false},\"black-white-list\":{\"do-tables\":null,\"do-dbs\":null,\"ignore-tables\":null,\"ignore-dbs\":null}}"]
.....
[2022/12/31 19:30:16.228 +08:00] [INFO] [local.go:1628] ["import engine success"] [uuid=ec8f0c5c-418c-54b2-9184-b13c5a204994] [size=30242144079] [kvs=363826884] [importedSize=30242144079] [importedCount=363826884]
[2022/12/31 19:30:16.230 +08:00] [INFO] [backend.go:479] ["import completed"] [engineTag=`test_order`.`test_order`:-1] [engineUUID=ec8f0c5c-418c-54b2-9184-b13c5a204994] [retryCnt=0] [takeTime=2m2.580363441s] []
[2022/12/31 19:30:16.233 +08:00] [INFO] [backend.go:491] ["cleanup start"] [engineTag=`test_order`.`test_order`:-1] [engineUUID=ec8f0c5c-418c-54b2-9184-b13c5a204994]
[2022/12/31 19:30:16.867 +08:00] [INFO] [backend.go:493] ["cleanup completed"] [engineTag=`test_order`.`test_order`:-1] [engineUUID=ec8f0c5c-418c-54b2-9184-b13c5a204994] [takeTime=634.229136ms] []
[2022/12/31 19:30:16.867 +08:00] [INFO] [table_restore.go:975] ["import and cleanup engine completed"] [engineTag=`test_order`.`test_order`:-1] [engineUUID=ec8f0c5c-418c-54b2-9184-b13c5a204994] [takeTime=2m3.217168095s] []
[2022/12/31 19:30:16.870 +08:00] [INFO] [tidb.go:388] ["alter table auto_increment start"] [table=`test_order`.`test_order`] [auto_increment=211255163]
[2022/12/31 19:30:17.389 +08:00] [INFO] [tidb.go:390] ["alter table auto_increment completed"] [table=`test_order`.`test_order`] [auto_increment=211255163] [takeTime=519.521074ms] []
[2022/12/31 19:30:17.392 +08:00] [INFO] [restore.go:1563] ["restore table completed"] [table=`test_order`.`test_order`] [takeTime=19m49.495832828s] []
[2022/12/31 19:30:17.392 +08:00] [INFO] [restore.go:1309] ["cancel periodic actions"] [do=true]
[2022/12/31 19:30:17.392 +08:00] [INFO] [restore.go:1869] ["switch import mode"] [mode=Normal]
[2022/12/31 19:30:17.465 +08:00] [INFO] [table_restore.go:750] ["local checksum"] [table=`test_order`.`test_order`] [checksum="{cksum=13119691018140391503,size=98489284541,kvs=394145791}"]
[2022/12/31 19:30:17.465 +08:00] [INFO] [checksum.go:159] ["remote checksum start"] [table=test_order]
[2022/12/31 19:30:27.897 +08:00] [INFO] [restore.go:1284] [progress] [total=100.0%] [tables="1/1 (100.0%)"] [chunks="678/678 (100.0%)"] [engines="2/2 (100.0%)"] [restore-bytes=62.83GiB/62.83GiB] [import-bytes=91.73GiB/91.73GiB(estimated)] ["encode speed(MiB/s)"=53.61944249195604] [state=post-processing] []
[2022/12/31 19:30:49.645 +08:00] [INFO] [checksum.go:162] ["remote checksum completed"] [table=test_order] [takeTime=32.179808752s] []
[2022/12/31 19:30:49.645 +08:00] [INFO] [table_restore.go:1002] ["checksum pass"] [table=`test_order`.`test_order`] [local="{cksum=13119691018140391503,size=98489284541,kvs=394145791}"]
[2022/12/31 19:30:49.648 +08:00] [INFO] [table_restore.go:843] ["skip analyze"] [table=`test_order`.`test_order`]
[2022/12/31 19:30:49.652 +08:00] [INFO] [restore.go:1532] ["restore all tables data completed"] [takeTime=20m21.76298669s] []
[2022/12/31 19:30:49.652 +08:00] [INFO] [restore.go:1535] ["cleanup task metas"]
[2022/12/31 19:30:49.653 +08:00] [INFO] [restore.go:1829] ["skip full compaction"]
[2022/12/31 19:30:49.653 +08:00] [INFO] [restore.go:2018] ["clean checkpoints start"] [keepAfterSuccess=remove] [taskID=1672485025432262754]
[2022/12/31 19:30:49.653 +08:00] [INFO] [restore.go:1171] ["everything imported, stopping periodic actions"]
[2022/12/31 19:30:49.653 +08:00] [INFO] [restore.go:2026] ["clean checkpoints completed"] [keepAfterSuccess=remove] [taskID=1672485025432262754] [takeTime=675.614µs] []
[2022/12/31 19:30:49.653 +08:00] [INFO] [restore.go:476] ["the whole procedure completed"] [takeTime=20m24.181465093s] []
[2022/12/31 19:30:49.707 +08:00] [INFO] [checksum.go:459] ["service safe point keeper exited"]
[2022/12/31 19:30:49.707 +08:00] [INFO] [main.go:106] ["tidb lightning exit"] [finished=true]
```

导入期间 tidb-server 不工作 CPU 监控略。

导入期间 tikv-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389094.png)

空间占用监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389564.png)

空间占用约 51.8 GB。（batch insert select 的方式空间占用约 85.6 GB)

### 导出数据并导入的效率记录

|      |        |                 |                |                                                     |
| ---- | ------ | --------------- | -------------- | --------------------------------------------------- |
|      | 时间     | TiDB CPU        | TiKV CPU       | 备注                                                  |
| 导出数据 | 5m     | 节点1：88%节点2：170% | 四节点轮流达到 600%   | 63 GB 数据文件。&#x20;dumpling 操作节点的 CPU 接近 800%。        |
| 导入数据 | 20m24s | -               | 最后阶段四节点达到 800% | Local 模式，含索引。早期阶段 tidb-lightning 操作节点的 CPU 达到 800%。 |
| 总计   | 25m24s |                 |                |                                                     |

## 方法四：手工分段并行插入

### 16 并发插入原表

可以通过手工对主键进行分段，再分任务对节点进行多会话的并发插入。

```Shell
# cat SQL1
select concat('insert into test_order.test_order_target4 select * FROM test_order   where  id  between ', min(t.id) ,' and ',  max(t.id) , ';') from ( select id,row_number () over (order by id) as row_num from test_order.test_order ) t group by floor(t.row_num / 1000) order by min(t.id);
// 根据 t.id 的顺序，每 1000 行做成一个 insert into test_order.test_order_target4 select * FROM test_order   where  id  between ... and ... 的分段。

# export SELECT_SQL=`cat SQL1`
# mysql -h 192.168.48.32 -P 4000 -u root -D test_order -N -e "${SELECT_SQL}" >INSERT_SQL
# time mysql -h 192.168.48.32 -P 4000 -u root -D test_order -N -e "${SELECT_SQL}" >INSERT_SQL

real    0m8.863s
user    0m0.085s
sys     0m0.011s
// 生成 INSERT 语句

# wc -l INSERT_SQL
30319 INSERT_SQL
# calc 30319/16
        1894.9375
# /bin/rm INSERT_SQL_PART*
# split -l 1895 -d -a2 INSERT_SQL INSERT_SQL_PART
// 按总的 INSERT 语句行数量进行 16 个子任务的拆分。

# ls INSERT_SQL_PART*
INSERT_SQL_PART00  INSERT_SQL_PART02  INSERT_SQL_PART04  INSERT_SQL_PART06  INSERT_SQL_PART08  INSERT_SQL_PART10  INSERT_SQL_PART12  INSERT_SQL_PART14
INSERT_SQL_PART01  INSERT_SQL_PART03  INSERT_SQL_PART05  INSERT_SQL_PART07  INSERT_SQL_PART09  INSERT_SQL_PART11  INSERT_SQL_PART13  INSERT_SQL_PART15
# for line in `ls INSERT_SQL_PART*`; do mysql -h 192.168.48.23 -P 4000 -u root -D test_order <${line} &  done
[1] 28233
[2] 28234
[3] 28235
[4] 28236
[5] 28237
[6] 28238
[7] 28239
[8] 28240
[9] 28241
[10] 28242
[11] 28243
[12] 28244
[13] 28245
[14] 28246
[15] 28247
[16] 28248
# 
// 16 个并发执行 insert 子任务
```

因为是后台运行，需要从连接数监控查看执行时间：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389054.png)

总耗时约 38 分钟。

并行插入期间 tidb-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389083.png)

并行插入期间 tikv-server 的 CPU 监控如下：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389566.png)

### 16 并发插入无索引表

可以通过手工对主键进行分段，再分任务对节点进行多会话的并发插入。

从连接数监控查看执行时间：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/unnamed-1672658389581.png)

总耗时约 13 分钟。

### 总结

|                           |                          |                       |                                                |
| ------------------------- | ------------------------ | --------------------- | ---------------------------------------------- |
| 大类                        | 小类                       | 成绩                    | 成绩备注                                           |
| 非事务 DML 语句                | 单次 1000 行                | 2 hours 20 min        |                                                |
|                           | 单次 200 行                 | 2 hours 40 min 10 sec |                                                |
| 非事务 DML 语句插入无索引表再用加速功能建索引 | 默认索引参数（复用插入无索引表成绩）       | 2 hour 5 min 23 sec   | 插入无索引表：1 hour 53 min 23 sec默认的索引参数建索引：约 12 min |
|                           | 优化索引参数（复用插入无索引表成绩）       | 2 hour 2 min 23 sec   | 插入无索引表：1 hour 53 min 23 sec优化的索引参数建索引：9 min    |
| 导出后导入                     | 8 并行导出和导入                | 25 min 24 sec         | 导出数据：5 min导入数据：20 min 24 sec（无analyze）         |
| 手工分段并行插入                  | 16 并发插入原表                | 38 min                | 关闭后台 analyze                                   |
|                           | 16 并发插入无索引表再建索引（复用建索引成绩） | 22 min                | 16 并发插入无索引表：13 min优化的索引参数建索引：9 min关闭后台 analyze |

各场景对比下：

|                           |                     |                         |
| ------------------------- | ------------------- | ----------------------- |
| 大类                        | 优点                  | 缺点                      |
| 非事务 DML 语句                | 简单易用，单条语句完成支持开发代码嵌入 | 执行时间长                   |
| 非事务 DML 语句插入无索引表再用加速功能建索引 | 后建索引符合运维人员的操作习惯     | 执行时间长索引少的场景优势不明显        |
| 导出后导入                     | 执行时间短TiDB 版本通用性好    | 需要有落地空间需要文件改名不适用于开发代码使用 |
| 手工分段并行插入                  | 执行时间短适用于开发代码使用      | 步骤较多                    |
| 手工分段并行插入无索引表再用加速功能建索引     | 执行时间最短              | 步骤较多                    |

