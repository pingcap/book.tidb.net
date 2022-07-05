 ---
 title: TiDB 6.0新特性漫谈之Clinic
 hide_title: true
 ---

# TiDB 6.0新特性漫谈之Clinic
> 作者：[Mars](https://tidb.net/u/%E4%BB%A3%E6%99%93%E7%A3%8A_Mars/answer)，公众号：Mars\_share\_DB，TUG华北区Leader，PIngCAP金牌认证讲师，MOA/MVA .

PingCAP Clinic 诊断服务（以下简称为 PingCAP Clinic）是 PingCAP 为 TiDB 集群提供的诊断服务，支持对使用 TiUP 或 TiDB Operator 部署的集群进行远程定位集群问题和本地快速检查集群状态，用于从全生命周期确保 TiDB 集群稳定运行、预测可出现的集群问题、降低问题出现概率、快速定位并修复问题。

![](/Users/mars.dai/Downloads/公众号/clinic-new.png)

## 一、传统的故障排查

谈 Clinic 这个工具之前，不得不讲讲之前遇到故障时，找官方排查的血泪史。遇到 bug 时，官方技术支持一般要求提供：TiDB 集群信息（版本、display）、grafana 监控、各个组件 (TiDB/PD/TiKV/TiCDC/DM) 日志、系统参数配置等。从 asktug 的帖子说明就可以看出需要用户提供的一些清单，主要包括 TiDB 集群节点信息、配置信息、集群监控、对应出问题组件的日志：
	
	【 TiDB  使用环境】
	【概述】 场景 + 问题概述
	【背景】 做过哪些操作
	【现象】 业务和数据库现象
	【问题】 当前遇到的问题
	【业务影响】 
	【TiDB 版本】 
	【应用软件及版本】
	【附件】 相关日志及配置信息
	
	* TiUP Cluster Display 信息
	* TiUP CLuster Edit config 信息
	
	监控（https://metricstool.pingcap.com/)
	* TiDB-Overview Grafana监控
	* TiDB Grafana 监控
	* TiKV Grafana 监控
	* PD Grafana 监控
	* 对应模块日志（包含问题前后 1 小时日志）

### 1、提供监控

先聊 grafana 监控，下面的各个阶段都是我之前经历和使用过的提供监控的方式方法，大家用的过麻烦点赞。

（1）手动截图，刚开始技术支持会按照排除法给用户来定位问题。比如一个 oom 问题可能有几种导致的原因，技术支持同学会一个个让你截图来排除。这时的问题如下：

	* 混乱繁杂（技术支持只能靠一点点猜想找你要截图，而且需要看看多个截图，光截图和问题判断的相互配合就需要大家的一上午或者下午的时间）
	* 时间跨度不好定（比如：看详情需要 30 分钟内，如果要对比昨天的数据则需要看 2 天，同一个图可能需要截图不同时间段）
	* 拿 TiKV-Details 这个 dashboard 来讲，上百个监控指标，光打开就分钟级别，再找就需要半分钟。
	* 效率低下，刚开始还担心数据安全，截图后，自己还需要加“马赛克”，再加上排除法的来来回回的反馈，半天的时间很快就过去了，问题还没有及时的定位。

（2） 后来 PingCAP 官方提供了一个“脚本”，脚本的好处就是避免手工截图，可以以 json 的方式导出 grafana 监控，然后发送给官方技术支持，他们收到这个 json 可以自己 load 到本地的 grafana 查看，避免了截图的效率低下，这个脚本也可以自己保存 json 数据。

  脚本的链接如下：

  https://metricstool.pingcap.com/

PS：脚本的主要问题，像 TiKV-Details 存储的时间比较长，另外 grafana 版本的变更，Chrome 的升级也可能带来兼容性的问题，需要频繁的调整脚本。另外你可能还需要具备“前端工程师”的能力。

### 2、提供日志
有时监控不能完全确认问题，还需要有日志的辅助，这时就需要提供各个组件的日志，就拿一个慢日志造成的 TiKV OOM 举例，需要提供的日志：

（1）TiDB server 的日志，找“Welcome”关键词(代表重启)的附近 [expensive_query] 相关日志。

（2）TiDB 的 slow log，找 query-time，total-keys，process-keys 等指标，来找出导致问题的 SQL。

（3）TiKV 的日志，看是否读写有热点。

（4）如果涉及到统计信息不更新导致慢查询的问题，可能也需要查看 PD Leader 相关的日志。

**提供日志的问题：**

（1）有时需要提供所有 TiKV 组件的日志，假如你的 TiKV 节点比较多，又没有 ELK 这种日志收集平台的话，一台台的远程登录，找对应时间段的日志（可能因为日志切分放到了不同的文件），折腾一遭非常的痛苦。

（2）有时需要提供日志文件过大（微信只支持 100M），发送给官方人员的还需要各种渠道（比如通过 QQ 邮件传上 G 的日志文件，给到官方技术支持），并且发送时间也较长。

###3、涉及的安全问题
很多小伙伴把自己业务的 grafana 监控放到 asktug 这个公共平台，对于大量的监控截图虽说是可以抹除敏感信息，但是光加马赛克就各种折腾和大量时间消耗。另外日志等信息放 asktug 这个平台就不好弄了，因为 asktug 是注册就可以看到大家发的帖子，包括各种截图以及日志信息。所以不免导致上传者担心的自己 TiDB 集群信息安全。

##二、PingCAP Clinic 
我想告诉大家的是，救星终于来了，以后 asktug 提故障帖子，不需要各种截图还打马赛克，也不需要脚本导json，各种苦哈哈的提供各种组件的日志。PingCAP 公司的技术人员，根据多年来问题排查的经验，提供了 Clinic 这个诊断服务来统一收集集群的各个指标(下面会有详细的指标收集说明)、统一上传到 PingCAP 公司的 Clinic Server 上，在 asktug 上，你只需要提供给官方技术一个上传完毕的链接即可，不要担心，你上传的数据首先只能官方人员和自己查看，并且在 case 解决并关闭后可以自行删除或者系统默认会在 90 天内删除，所以再也不用担心自己公司集群信息(日志/监控)暴露给其他用户的安全问题。

所以通过上面的说明可以了解到，Clinic 这个解决方案提供了 2 个组件。

* Clinic 数据采集端 Diag，该组件用来采集各种数据。
* Clinic Server 用于接收用户上传的各种采样数据，云诊断平台可以将收集来的数据进行展示，从而快速帮客户定位问题。


### 1、Diag 都采集什么数据

（1）集群信息
   
 包括集群基本信息，集群节点的硬件配置、内核参数等。
 
*  tiup cluster audit/display/edit-config 获取集群的信息。
*  tiup exec --command 可以执行 Insight 等命令获取系统信息，包括内核日志、内核参数、系统和硬件的基础信息。

（2）TiDB 组件配置和日志
    
TiDB/pd/TiKV/tiflash/ticdc/dm 的配置和日志，底层使用 SCP 直接从目标组件的节点采集日志文件和配置文件

(3)  监控

* 	通过 Prometheus 提供的 HTTP API，数据收集组件可获取 Alert 和 metric 监控指标
*  另外 TiDB 的各个组件本身就暴露了 HTTP 接口，数据收集组件可以实时收集采样信息和进行性能采样。
	

**PS：这些不就是我们之前苦哈哈的手动需要提供的么？以后可以通过 Diag 数据收集工具几个命令搞定**。


### 2、使用 Diag 采集集群数据

（1）安装
Diag 诊断客户端：部署在集群侧的工具，用于采集集群的诊断数据 (collect)、上传诊断数据到 Clinic Server、对集群进行本地快速健康检查 (check)。

在tiup中控机上使用下面的命令安装，看到安装应该是 v0.7.1 版本：
	
	tiup install diag
	download https://tiup-mirrors.pingcap.com/diag-v0.7.1-linux-amd64.tar.gz 17.57 MiB / 17.57 MiB 100.00% 10.74 MiB/s

（2）采集近2小时的诊断数据。

	tiup diag collect ${cluster-name} 
	#执行命令过程不会马上收集，会大概展示要收集的内容、数据的大小，诊断数据的路径：以diag开头的文件夹，确认后开始收集，收集完毕，进入路径发现以下内容：
	cluster_audit             #集群的audit信息，执行tiup cluster audit|grep 集群得到
	cluster.json               #集群的display信息，执行tiup cluster display的结果
	fTLypmPrm8j_diag_audit.log    #tiup diag的执行日志，通过该日志可以看出详细的收集流程
	meta.yaml                 #集群的meta信息，执行tiup cluster edit-config可以得到
	monitor/                   #集群的大量的详细的grafana监控dashboard的json文件
	test1.xxxx.com/          #各个TiDB组件的详细日志+系统配置
	..........
	test10.xxxx.com/   #进入该目录
		datax/           #TiDB集群组件配置和日志
		dmesg.log      #系统内核日志，记录了操作系统硬件故障/oom kill等信息
		insight.json     #系统和硬件的基础信息
		limits.conf      #系统limit.conf的信息
		ss.txt             #系统网络情况
		sysctl.conf      #操作系统内核参数配置sysctl.conf
	
PS：默认 diag 会采集近2小时数据，如果要采集更早的某个时间段，可以通过 --from/--to来指定，详见
tiup diag collect --help

(3) 上传数据到 Clinic Server 给 PingCAP 官方技术人员查看。

	tiup diag upload ${filepath}

完成上传后，Diag 会提示诊断数据的下载路径 Download URL，以后只需要提供该 URL 给官方支持人员就 OK 了，然后就是等反馈了。

PS：早期我使用的时候，上传还是统一的用户名和密码，新的版本已经需要 Access Token 进行用户认证后上传，具体认证的方式，可以查看官网。

### 3、Clinic 还能干啥？


（1）集群抖动现场保留

当集群出现问题，但无法马上进行问题分析时，你可以先使用 Diag 采集数据，并将其数据保存下来，用于自己后期进行问题分析。

（2）日常巡检：预测可出现的集群的配置问题

Clinic 设计之初应该就是以后做日常 TiDB 巡检的工具，不过当前的 Technical Preview 版本只提供对配置项检查，用于发现不合理的配置，并提供修改建议。
	
	#执行收集当前集群配置
	tiup diag collect ${cluster-name} --include="config"
	# 执行完毕后会生成一个数据目录
	tiup diag check ${subdir-in-output-data}
	#查看结果发现提示了几个Rule name TiDB-max-days/backups、pdconfig-max-days/backups的warning,每个报警都有个链接可以知道具体的报警原因，比如下面就是TiDB 的日志最大保留的天数设置为0（永久保存）导致的警告
	#### Rule Name: TiDB-max-days
	- RuleID: 100
	- Variation: TiDBConfig.log.file.max-days
	- For more information, please visit: https://s.TiDB.io/msmo6awg
	- Check Result:
	  TiDBConfig_xxxx.com:4000   TiDBConfig.log.file.max-days:0   warning
	  TiDBConfig_xxxx.com:4000   TiDBConfig.log.file.max-days:0   warning
	
（3）收集DM集群的诊断数据
       
   主要采集DM集群信息，dm-master/worker的日志和配置，以及DM的监控，DM集群各个节点的硬件信息。
   
  	tiup diag collectdm ${cluster-name} -f="-4h" -t="-2h"
  
  注意：这里跟上面的TiDB集群收集的命令不同主要在diag后面的collectdm参数上，别写错了。
  

## 三、总结
PingCAP Clinic 作为一个诊断工具，是为了提供更好的故障排查、集群巡检等服务，保障 TiDB 集群的稳定和高效，作为一个 TiDB 的资深用户，经历了之前有种种问题的老方案洗礼，该工具在定位集群问题效率上有了明显的提升，但是目前该工具只是 Technical Preview 阶段，集群预测也只是提供了配置 check 功能，相信在未来迭代的版本中，出现更多、更好、更易用的功能。

最后要想更多了解 Clinic 可以查看官方链接： 

https://docs.PingCAP.com/zh/TiDB/v6.0/clinic-data-instruction-for-tiup
