---
title: 基于tidbV6.0探索tiflash在多标签组合场景下的使用
hide_title: true
---

# 基于tidbV6.0探索tiflash在多标签组合场景下的使用

> 作者：**[边城元元](https://tidb.net/u/%E8%BE%B9%E5%9F%8E%E5%85%83%E5%85%83/post/all)** 发表于 **2022-05-16**

## 一、背景

1、有一个需求多字段表和几个基础信息表，现在的需求是需要对多字段表任意字段任意组合的查询。

2、考虑到对多个字段的不定组合进行筛选的话肯定要进行全表扫了。目前TiDBV6.0已经发布有一段时间了，TiFlash的性能也更加抢强大和稳定了，决定实验使用TiFlash来承接这部分的业务需求。

## 二、准备

### 2.1 建立TiDB cluster111

- 拓扑如下（cluster111-full.yaml）

```
global:
  user: "tidb"
  ssh_port: 22
  deploy_dir: "/tidb-deploy"
  data_dir: "/tidb-data"

# # Monitored variables are applied to all the machines.
monitored:
  node_exporter_port: 9100
  blackbox_exporter_port: 9115

server_configs:
  tidb:
    log.slow-threshold: 300
    binlog.enable: false
    binlog.ignore-error: false
  tikv:
    readpool.storage.use-unified-pool: false
    readpool.coprocessor.use-unified-pool: true
  pd:
    schedule.leader-schedule-limit: 4
    schedule.region-schedule-limit: 2048
    schedule.replica-schedule-limit: 64
    replication.location-labels:
      - host

pd_servers:
  - host: 10.0.2.15
    # ssh_port: 22
    # name: "pd-1"
    client_port: 2379
    # peer_port: 2380


tidb_servers:
  - host: 10.0.2.15


tikv_servers:
  - host: 10.0.2.15
    # ssh_port: 22
    port: 20160
    status_port: 20180
    config:
      server.grpc-concurrency: 4
      #server.labels: {host: "10.0.2.15.20160" }

monitoring_servers:
  - host: 10.0.2.15

grafana_servers:
  - host: 10.0.2.15

alertmanager_servers:
  - host: 10.0.2.15


```

- 部署集群

  > 具体的部署可以参考文章 https://tidb.net/blog/af8080f7#TiDB-最小实践Cluster111

```
# tiup cluster list 
# tiup cluster stop cluster111
# tiup cluster destroy cluster111

# 部署cluster111集群
tiup cluster deploy cluster111 ./cluster111-full.yaml --user root -p

tiup cluster start cluster111
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685013834.png)﻿﻿

### 2.2 创建库表

```
CREATE TABLE `m_cust_org` (
  `cust_id` char(30) not null,            
  `org_id` varchar(10) default null,        
  `org_name` varchar(100) default null,     
  `org_ii_id` varchar(10) default null,     
  `org_ii_name` varchar(100) default null,  
  `org_i_id` varchar(10) default null ,   
  `org_i_name` varchar(100) default null,   
  `org_level` varchar(2) default null ,                                                                           
  `pici` bigint(20) not null default '0',                                                                            
  PRIMARY KEY (`cust_id`) /*T![clustered_index] CLUSTERED */,
  KEY `ix_m_cust_org_orgidmgrig` (`org_id`,`mgr_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='条件筛选表';


CREATE TABLE `m_cust_main` (
  `cust_id` char(30) not null ,             
  `cust_name` varchar(200) default null,    
  `cert_type` varchar(13) default null,     
  `cert_num` varchar(40) default null ,     
  `cust_type` varchar(2) default null ,     
  `sex` varchar(13) default null,           
  `age` int(11) default null ,              
  `birth_dt` varchar(13) default null ,   
  `marriage` varchar(13) default null ,   
  `city_code` varchar(100) default null , 
  `nation_code` varchar(100) default null ,                                                         
  `edu` varchar(13) default null ,        
  `ocup` varchar(100) default null ,      
  `post` varchar(20) default null ,       
  `copy_name` varchar(200) default null , 
  `contact_addr` varchar(200) default null ,                                                         
  `card_level` varchar(2) default null ,  
  `service_level` varchar(2) default null ,                                                         
  `estimate_level` varchar(2) default null ,
  `mark_id` varchar(50) default null ,    
  `mark_name` varchar(255) default null , 
  primary key (`cust_id`) /*t![clustered_index] clustered */,
  key `idx_m_cust_main_desc1` (`cert_type`,`cert_num`),
  key `idx_m_cust_main_desc_3` (`cust_name`)
) engine=innodb default charset=utf8mb4 collate=utf8mb4_bin comment='客户主表';

CREATE TABLE `m_cust_data` (
  `cust_id` char(30) not null     ,          
  `asset` decimal(18,2) default null ,    
  `asset_mon_avg` decimal(18,2) default null ,
  `asset_sea_avg` decimal(18,2) default null ,
  `asset_yea_avg` decimal(18,2) default null ,
  `asset_roll_avg` decimal(18,2) default null ,
  `debt` decimal(18,2) default null ,     
  `dep_bal` decimal(18,2) default null ,  
  `dep_mon_avg` decimal(18,2) default null ,
  `dep_sea_avg` decimal(18,2) default null ,
  `dep_yea_avg` decimal(18,2) default null ,
  `nd_bal` decimal(18,2) default null ,   
  `mf_bal` decimal(18,2) default null ,   
  `fund_bal` decimal(18,2) default null , 
  `ccard_out_amt` decimal(18,2) default null ,
  `ccard_bal` decimal(18,2) default null ,
  `ins_bal` decimal(18,2) default null ,  
  `loan_bal` decimal(18,2) default null , 
  `loan_amt` decimal(18,2) default null , 
  `etl_date` char(8) default null ,       
  `qszg_bal` decimal(24,2) default null , 
  `dx_fnc_bal` decimal(24,2) default null ,
  `cur_dep_bal` decimal(18,2) default null ,
  `rep_bal` decimal(18,2) default null ,  
  `rep_avg` decimal(18,2) default null ,  
  `is_rep_beyond` char(2) default null ,
  Primary Key (`cust_id`) /*t![clustered_index] clustered */,
  Key `idx_m_cust_query_desc_4` (`asset_sea_avg`,`cust_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='客户频繁更新数据表';


CREATE TABLE `m_cust_label` (
  `cust_id` char(30) NOT NULL,                   
  `cat1` int not null default  0 ,              
`cat2` int not null default  0 ,                
`cat3` int not null default  0 ,                
`cat4` int not null default  0 ,                
`cat5` int not null default  0 ,                
`cat6` int not null default  0 ,                
`cat7` int not null default  0 ,                
`cat8` int not null default  0 ,                
`cat9` int not null default  0 ,                
`cat10` int not null default  0 ,               
`cat11` int not null default  0 ,               
`cat12` int not null default  0 ,               
`cat13` int not null default  0 ,               
`cat14` int not null default  0 ,               
`cat15` int not null default  0 ,               
`cat16` int not null default  0 ,               
`cat17` int not null default  0 ,               
`cat18` int not null default  0 ,               
`cat19` int not null default  0 ,               
`cat20` int not null default  0 ,               
`cat21` int not null default  0 ,               
`cat22` int not null default  0 ,               
`cat23` int not null default  0 ,               
`cat24` int not null default  0 ,               
`cat25` int not null default  0 ,               
`cat26` int not null default  0 ,               
`cat27` int not null default  0 ,               
`cat28` int not null default  0 ,               
`cat29` int not null default  0 ,               
`cat30` int not null default  0 ,               
`cat31` int not null default  0 ,               
`cat32` int not null default  0 ,               
`cat33` int not null default  0 ,               
`cat34` int not null default  0 ,               
`cat35` int not null default  0 ,               
`cat36` int not null default  0 ,               
`cat37` int not null default  0 ,               
`cat38` int not null default  0 ,               
`cat39` int not null default  0 ,               
`cat40` int not null default  0 ,               
`cat41` int not null default  0 ,               
`cat42` int not null default  0 ,               
`cat43` int not null default  0 ,               
`cat44` int not null default  0 ,               
`cat45` int not null default  0 ,               
`cat46` int not null default  0 ,               
`cat47` int not null default  0 ,               
`cat48` int not null default  0 ,               
`cat49` int not null default  0 ,               
`cat50` int not null default  0 ,               
`cat51` int not null default  0 ,               
`cat52` int not null default  0 ,               
`cat53` int not null default  0 ,               
`cat54` int not null default  0 ,               
`cat55` int not null default  0 ,               
`cat56` int not null default  0 ,               
`cat57` int not null default  0 ,               
`cat58` int not null default  0 ,               
`cat59` int not null default  0 ,               
`cat60` int not null default  0 ,               
`cat61` int not null default  0 ,               
`cat62` int not null default  0 ,               
`cat63` int not null default  0 ,               
`cat64` int not null default  0 ,               
`cat65` int not null default  0 ,               
`cat66` int not null default  0 ,               
`cat67` int not null default  0 ,               
`cat68` int not null default  0 ,               
`cat69` int not null default  0 ,                      
 PRIMARY KEY (`CUST_ID`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='客户检索标签';

```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685026789.png)﻿﻿

### 2.3 初始化数据种子表

```
-- 建立seed
-- m_seed
drop table if exists `m_seed`;
CREATE TABLE `m_seed` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`) 
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

truncate table m_seed;
SELECT * from m_seed;


insert into m_seed values();
-- 不连续的id 每次 【执行完后，auto_inccreaid 造成不连续】
insert into m_seed select null from m_seed;
insert into m_seed select null from m_seed;
insert into m_seed select null from m_seed;
insert into m_seed select null from m_seed;
insert into m_seed select null from m_seed;
insert into m_seed select null from m_seed;

-- 本地虚拟机环境配置比较低这里使用每次528条记录
-- 528 
SELECT count(*) from m_seed;
```

### 2.4 初始化数据脚本bat版

```
::echo off
@echo off
    

rem 每次的数量为 m_seed表中的记录数
rem 总次数
set/a sumnum=200
set num=0

rem 这里必须有 start标签，否则循环里去时间 （都一样 的时间，需要从新调度）
rem 在bat里有中文的，需要设置为gb2312的编码，，到sql才是中文
:start 
    set pici=%Date:~5,2%%Date:~8,2%%Time:~0,2%%Time:~3,2%%Time:~6,2%
    set pici=%pici: =%
    echo %pici%

    

    echo '----------------1-----------'
    mysql -h 127.0.0.1 -P 4000 -u "root"  -D b_crm -e "INSERT INTO b_crm.m_cust_org(CUST_ID, ORG_ID, ORG_NAME, ORG_II_ID, ORG_II_NAME, ORG_I_ID, ORG_I_NAME, ORG_LEVEL, pici) select concat('%pici%','A',id), FLOOR( 100 + RAND() * (10000 - 100)),concat('归属三级机构名称', RAND() ), FLOOR( 100 + RAND() * (10000 - 100)),concat('归属二级机构名称', RAND() ), FLOOR( 100 + RAND() * (10000 - 100)),concat('归属一级机构名称', RAND() ), FLOOR( 1 + RAND() * (10 - 1)),'%pici%' from m_seed " --default-character-set=utf8

    echo '----------------2-----------'
    rem 2
    mysql -h 127.0.0.1 -P 4000 -u "root"  -D b_crm -e "INSERT INTO m_cust_data(CUST_ID, ASSET, ASSET_MON_AVG, ASSET_SEA_AVG, ASSET_YEA_AVG, ASSET_ROLL_AVG, DEBT, DEP_BAL, DEP_MON_AVG, DEP_SEA_AVG, DEP_YEA_AVG, ND_BAL, MF_BAL, FUND_BAL, CCARD_OUT_AMT, CCARD_BAL, INS_BAL, LOAN_BAL, LOAN_AMT, ETL_DATE, QSZG_BAL, DX_FNC_BAL, CUR_DEP_BAL, REP_BAL, REP_AVG, IS_REP_BEYOND) select concat('%pici%','A',id) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) , FLOOR(RAND() *100000000) ,DATE_FORMAT(FROM_UNIXTIME(1524895617+FLOOR(RAND() * 126230510)),'%%Y%%m%%d') , FLOOR(RAND() *10000000) , FLOOR(RAND() *10000000) , FLOOR(RAND() *10000000) , FLOOR(RAND() *10000000) , FLOOR(RAND() *10000000) , if(RAND() >0.9,'Y','N') from m_seed " --default-character-set=utf8
    
    echo '----------------3-----------' 
    rem 3
    mysql -h 127.0.0.1 -P 4000 -u "root"  -D b_crm -e "INSERT INTO m_cust_main(CUST_ID, CUST_NAME, CERT_TYPE, CERT_NUM, CUST_TYPE, SEX, AGE, BIRTH_DT, MARRIAGE, CITY_CODE, NATION_CODE, EDU, OCUP, POST, COPY_NAME, CONTACT_ADDR, CARD_LEVEL, SERVICE_LEVEL, ESTIMATE_LEVEL, MARK_ID, MARK_NAME) select  concat('%pici%','A',id)  ,concat(substring('赵钱孙李周吴郑王冯陈诸卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮齐康伍余元卜顾孟平黄和穆萧尹姚邵堪汪祁毛禹狄米贝明臧计伏成戴谈宋茅',floor(1+190*rand()),1),substring('明国华建文平志伟东海强晓生光林小民永杰军金健一忠洪江福祥中正振勇耀春大宁亮宇兴宝少剑云学仁涛瑞飞鹏安亚泽世汉达卫利胜敏群波成荣新峰刚家龙德庆斌辉良玉俊立浩天宏子松克清长嘉红山贤阳乐锋智青跃元武广思雄锦威启昌铭维义宗英凯鸿森超坚旭政传康继翔栋仲权奇礼楠炜友年震鑫雷兵万星骏伦绍麟雨行才希彦兆贵源有景升惠臣慧开章润高佳虎根远力进泉茂毅富博霖顺信凡豪树和恩向道川彬柏磊敬书鸣芳培全炳基冠晖京欣廷哲保秋君劲轩帆若连勋祖锡吉崇钧田石奕发洲彪钢运伯满庭申湘皓承梓雪孟其潮冰怀鲁裕翰征谦航士尧标洁城寿枫革纯风化逸腾岳银鹤琳显焕来心凤睿勤延凌昊西羽百捷定琦圣佩麒虹如靖日咏会久昕黎桂玮燕可越彤雁孝宪萌颖艺夏桐月瑜沛诚夫声冬奎扬双坤镇楚水铁喜之迪泰方同滨邦先聪朝善非恒晋汝丹为晨乃秀岩辰洋然厚灿卓杨钰兰怡灵淇美琪亦晶舒菁真涵爽雅爱依静棋宜男蔚芝菲露娜珊雯淑曼萍珠诗璇琴素梅玲蕾艳紫珍丽仪梦倩伊茜妍碧芬儿岚婷菊妮媛莲娟一',floor(1+400*rand()),1),substring('明国华建文平志伟东海强晓生光林小民永杰军金健一忠洪江福祥中正振勇耀春大宁亮宇兴宝少剑云学仁涛瑞飞鹏安亚泽世汉达卫利胜敏群波成荣新峰刚家龙德庆斌辉良玉俊立浩天宏子松克清长嘉红山贤',floor(1+400*rand()),if(rand()>0.6,0,1))) , FLOOR( 1 + RAND() * (13 - 1)) ,md5(rand()) , FLOOR( 1 + RAND() * (20 - 1)) , FLOOR( 1 + RAND() * (3 - 1))   , FLOOR( 1 + RAND() * (100 - 1)) , FLOOR( 1960 + RAND() * (2022 - 1960)) , if(RAND() >0.6,'Y','N') , FLOOR( 100 + RAND() * (500 - 100)) , FLOOR( 1 + RAND() * (57 - 1)) , FLOOR( 1 + RAND() * (6 - 1)) ,substring(md5(rand()), 1, 20) , FLOOR( 1000 + RAND() * (9000 - 1000)) ,concat('单位', RAND() ) ,concat('地址', RAND() ) , FLOOR( 1 + RAND() * (10 - 1)) , FLOOR( 1 + RAND() * (10 - 1)) , FLOOR( 1 + RAND() * (10 - 1)) , FLOOR( 10000 + RAND() * (90000 - 10000)) ,concat(substring('赵钱孙李周吴郑王冯陈诸卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮齐康伍余元卜顾孟平黄和穆萧尹姚邵堪汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董粱杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯咎管卢莫经房裘干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚',floor(1+190*rand()),1),substring('明国华建文平志伟东海强晓生光林小民永杰军金健一忠洪江福祥中正振勇耀春大宁亮宇兴宝少剑云学仁涛瑞飞鹏安亚泽世汉达卫利胜敏群波成荣新峰刚家龙德庆斌辉良玉俊立浩天宏子松克清长嘉红山贤阳乐锋智青跃元武广思雄锦威启昌铭维义宗英凯鸿森超坚旭政传康继翔栋仲权奇礼楠炜友年震鑫雷兵万星骏伦绍麟雨行才希彦兆贵源有景升惠臣慧开章润高佳虎根远力进泉茂毅富博霖顺信凡豪树和恩向道川彬柏磊敬书鸣芳培全炳基冠晖京欣廷哲保秋君劲轩帆若连勋祖锡吉崇钧田石奕发洲彪钢运伯满庭申湘皓承梓雪孟其潮冰怀鲁裕翰征谦航士尧标洁城寿枫革纯风化逸腾岳银鹤琳显焕来心凤睿勤延凌昊西羽百捷定琦圣佩麒虹如靖日咏会久昕黎桂玮燕可越彤雁孝宪萌颖艺夏桐月瑜沛诚夫声冬奎扬双坤镇楚水铁喜之迪泰方同滨邦先聪朝善非恒晋汝丹为晨乃秀岩辰洋然厚灿卓杨钰兰怡灵淇美琪亦晶舒菁真涵爽雅爱依静棋宜男蔚芝菲露娜珊雯淑曼萍珠诗璇琴素梅玲蕾艳紫珍丽仪梦倩伊茜妍碧芬儿岚婷菊妮媛莲娟一',floor(1+400*rand()),1),substring('明国华建文平志伟东海强晓生光林小民永杰军金健一忠洪江福祥中正振勇耀春大宁亮宇兴宝少剑云学仁涛瑞飞鹏安亚泽世汉达卫利胜敏群波成荣新峰刚家龙德庆斌辉良玉俊立浩天宏子松',floor(1+400*rand()),if(rand()>0.6,0,1)))  from  m_seed " --default-character-set=utf8
    
    
    echo '----------------4-----------' 
    mysql -h 127.0.0.1 -P 4000 -u "root"  -D b_crm -e "INSERT INTO m_cust_label(CUST_ID,cat1,cat2,cat3,cat4,cat5,cat6,cat7,cat8,cat9,cat10) select  concat('%pici%','A',id) , FLOOR(RAND() *1000),FLOOR(RAND() *1000),FLOOR(RAND() *100),FLOOR(RAND() *100),FLOOR(RAND() *10),FLOOR(RAND() *10),FLOOR(RAND() *800),FLOOR(RAND() *700),FLOOR(RAND() *600),FLOOR(RAND() *100000) from m_seed "
    
    

    rem 数值的相加
    set/a  num= %num%+1
    echo %num%
    echo %sumnum%
    rem 比较大小 geq 表示大于等于
    rem 注意小括号
    if %num% geq %sumnum% (
        echo '--------------------------'
        echo %sumnum%
        echo '---------end--------------'
        goto stop
    )
    
    timeout /T 5 /NOBREAK
        
    goto start
    

:stop
    echo '---stop ----'


pause
```

## 三、测试多字段组合

### 3.1 准备数据

#### 3.1.1 准备c1,c2,... c10 中找出数量排行前5的作为测试数据使用

```
-- cat1   516
select a1.* from (select 'c1',cat1,count(*) as ct  from m_cust_label GROUP BY cat1 ORDER BY ct desc limit 5 ) a1 union all
select a2.* from (select 'c2',cat2,count(*) as ct  from m_cust_label GROUP BY cat2 ORDER BY ct desc limit 5) a2 union all
select a3.* from (select 'c3',cat3,count(*) as ct  from m_cust_label GROUP BY cat3 ORDER BY ct desc limit 5 ) a3 union all
select a4.* from (select 'c4',cat4,count(*) as ct  from m_cust_label GROUP BY cat4 ORDER BY ct desc limit 5 ) a4 union all
select a5.* from (select 'c5',cat5,count(*) as ct  from m_cust_label GROUP BY cat5 ORDER BY ct desc limit 5 ) a5 union all
select a6.* from (select 'c6',cat6,count(*) as ct  from m_cust_label GROUP BY cat6 ORDER BY ct desc limit 5 ) a6 union all
select a7.* from (select 'c7',cat7,count(*) as ct  from m_cust_label GROUP BY cat7 ORDER BY ct desc limit 5 ) a7 union all
select a8.* from (select 'c8',cat8,count(*) as ct  from m_cust_label GROUP BY cat8 ORDER BY ct desc limit 5 ) a8 union all
select a9.* from (select 'c9',cat9,count(*) as ct  from m_cust_label GROUP BY cat9 ORDER BY ct desc limit 5 ) a9 union all
select a10.* from (select 'c10',cat10,count(*) as ct  from m_cust_label GROUP BY cat10 ORDER BY ct desc limit 5) a10;

cat字段，id值，记录条数
c3  19  155
c3  37  153
c3  45  153
c3  66  151
c3  50  151

c2  154 25
c2  937 25
c2  203 24
c2  82  23
c2  504 22

c5  7   1353
c5  1   1305
c5  4   1298
c5  3   1268
c5  8   1267

c4  99  159
c4  65  150
c4  47  150
c4  8   149
c4  46  148

c1  516 26
c1  710 26
c1  121 25
c1  230 25
c1  889 25

c6  0   1343
c6  9   1303
c6  7   1291
c6  6   1288
c6  8   1287

c7  196 30
c7  751 29
c7  756 27
c7  584 27
c7  265 26

c8  27  36
c8  239 33
c8  604 31
c8  214 30
c8  126 30

c9  416 39
c9  38  37
c9  69  36
c9  91  35
c9  72  35

c10 94038   3
c10 46313   3
c10 72580   3
c10 92499   3
c10 94648   3
```

#### 3.1.2 准备orgid

```
select ORG_ID,count(*) as ct from m_cust_org GROUP BY ORG_ID ORDER BY ct desc limit 10;
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685042079.png)﻿﻿

#### 3.1.3 开启TiFlash

```
-- 针对指定表开启 Tiflash（列存）
ALTER TABLE m_cust_label SET TIFLASH REPLICA 1;

-- 查看TiFlash同步状态
select * from information_schema.tiflash_replica;
select * from information_schema.TIFLASH_SEGMENTS;
select * from information_schema.TIFLASH_TABLES;
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685049064.png)﻿﻿

progress=1 表示同步完成！

### 3.2 具体场景分析

#### 3.2.1 仅有宽表m_cust_label字段的组合

> 思路：先找出主键，在组装其他需要字段

```
EXPLAIN ANALYZE
select a.*,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from(
 -- 思路找到cust_id
 select /*+ read_from_storage(tiflash[m]) */ m.cust_id from m_cust_label m where m.cat1 in(516,710,230) and m.cat2 in(154,504) ORDER BY m.cust_id desc limit 100

) a left join m_cust_main b on a.cust_id=b.cust_id 
left join m_cust_org c on a.cust_id=c.cust_id
left join m_cust_data d on a.cust_id=d.cust_id;
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685060408.png)﻿﻿

指定使用了Tiflash的列扫，

如果不指定Tiflash而是指定TikV又是什么情况呢？

```
EXPLAIN ANALYZE
select a.*,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from(
 -- 思路找到cust_id
 select /*+ read_from_storage(tikv[m]) */ m.cust_id from m_cust_label m where m.cat1 in(516,710,230) and m.cat2 in(154,504) ORDER BY m.cust_id desc limit 100

) a left join m_cust_main b on a.cust_id=b.cust_id 
left join m_cust_org c on a.cust_id=c.cust_id
left join m_cust_data d on a.cust_id=d.cust_id;
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685067643.png)﻿﻿

在不确定组合的情况下无法使tikv加索引如果数据量较大的话tiflash的列扫更优有事。

#### 3.2.2 仅有同表非宽表字段

```
EXPLAIN ANALYZE
select a.*,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from(
 -- 思路找到cust_id
 select n.cust_id from m_cust_org n where n.ORG_ID in('8716','7162') ORDER BY n.cust_id desc limit 100

) a left join m_cust_main b on a.cust_id=b.cust_id 
left join m_cust_org c on a.cust_id=c.cust_id
left join m_cust_data d on a.cust_id=d.cust_id;
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685075402.png)﻿﻿

#### 3.2.3 异表包含宽表字段

```
EXPLAIN ANALYZE
select a.*,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from(
 -- 思路找到cust_id
 select /*+ read_from_storage(tiflash[m]) */ m.cust_id from m_cust_label m right join m_cust_org n on m.CUST_ID=n.CUST_ID where m.cat1 in(516,710,230) and n.ORG_ID in('8716','7162') ORDER BY m.cust_id desc limit 100

) a left join m_cust_main b on a.cust_id=b.cust_id 
left join m_cust_org c on a.cust_id=c.cust_id
left join m_cust_data d on a.cust_id=d.cust_id
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685082560.png)﻿﻿

利用了Tiflash的列扫和Tikv的索引优势。

#### 3.2.4 异表不包含宽表字段

```
-- 1、先查cust_id的方式
EXPLAIN ANALYZE
select a.*,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from(
 -- 思路找到cust_id
 select m.cust_id from m_cust_data m right join m_cust_org n on m.CUST_ID=n.CUST_ID where m.ASSET BETWEEN 10 and 100  and n.ORG_ID in('8716','7162') ORDER BY m.cust_id desc limit 100

) a left join m_cust_main b on a.cust_id=b.cust_id 
left join m_cust_org c on a.cust_id=c.cust_id
left join m_cust_data d on a.cust_id=d.cust_id
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685090307.png)﻿﻿

```
-- 2、直接join的方式
EXPLAIN ANALYZE
select b.cust_id,b.CUST_NAME, b.CERT_TYPE, b.CERT_NUM, b.CUST_TYPE, b.SEX, b.AGE, b.BIRTH_DT,c.ORG_ID, c.ORG_NAME,d.ASSET,d.ASSET_MON_AVG from 
m_cust_main b
left join m_cust_org c on b.cust_id=c.cust_id
left join m_cust_data d on b.cust_id=d.cust_id where d.asset BETWEEN 10 and 100 and c.ORG_ID in('8716','7162') ORDER BY b.cust_id desc limit 100
```

﻿![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652685095694.png)﻿﻿

在测试环境中这2个的速度差不多，从执行计划来看的话 先查cust_id的效率高一些！

#### 3.3 Tiflash的优化

> 既然要使用TiFlash来承接宽表的检索 那么如何优化TiFlash呢。

- 1、TiFlash的副本最好大于1小于TiKV的数量
- 2、TiFlash的并发数

​              适当调大`tidb_distsql_scan_concurrency`增大并发度

- 3、TiFlash节点要独立部署

## 四、总结

> 基本思路：1)建立了聚簇表 ；2）使用where过滤数据保留尽可能晓的数据记录；3）先找主键再join

对于不确定字段组合的情况可以参考下面

- 1、不确定where条件列和order排序列 必定会走全表扫tableFullScan 使用tiflash来加速不确定条件的筛选
- 2、where，order，limit 只是筛选出主键， 根据主键再join出需要的字段。
- 3、不走tiflash的字段,可以考虑走tikv的索引

﻿