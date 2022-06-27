 ---
 title: 6.0体验：TiKV 重启后 Leader 均衡加速
 hide_title: true
 ---
> 本文作者：h5n1，TiDB 爱好者，目前就职于联通软件研究院。
# 1 前言

       为了均衡资源使用 TiDB 初始化后默认会创建 region-scheduler、leader-scheduler、hot-region-scheduler 三个调度器分别用于磁盘容量、计算和访问热点的均衡调度，TiDB 会根据计算的分值，将 region follower 或 leader 从高分值 TiKV 调度到低分值 TiKV，使各节点尽量达到均衡状态，以充分利用各节点资源。

# 2 region 调度和限制

         region 的调度是由 PD 根据 TiKV 上报的信息产生 operator 下发到 TiKV 去执行，Operator 是一组用于某个调度的操作集合，比如将 region 2 的 Leader 由 store 5 转移到 store 3。operator 调度是针对 region 的，实际上就是对 raft 成员的管理。

       region 调度的基本过程如下：

(1)TiKV 通过 StoreHeartbeat 和 RegionHeartbeat 两种心跳消息周期性的向 PD 报告 store和 region 状态信息。如容量、流量、region 范围、副本状态等信息。

(2)Scheduler 每隔一定时间会根据 TiKV 上报的信息生成 operator，每种调度会考虑不同调度逻辑和限制约束等。

(3)Scheduler 产生 operator 会放到等待队列中，随机选择或根据优先级将等待队列中的 operator 加入到 notifyqueue 中等待下发，同时会将 operator 转移到运行队列中从等待队列中删除。

(4)之后等到 TiKV 发送心跳时，将相应的 operator 通过心跳处理信息发送给 Region Leader 去处理。

(5)leader 根据 operator step 完成调度处理，处理完成后或超时后，pd 从运行队列中移除相关 operator。

![xiDHBmvOjZ.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/xiDHBmvOjZ-1652434271835.png)

       为控制调度速度，PD 提供了相关参数进行限制，balance-leader 的调度速度由 leader-schedule-limit 参数限制(默认值4)，调度执行时会首先判断是否允创建 operator，当前 runningOperator 队列中相应类型的 operator 数量小于 limit 参数限制时才允许调度产生 operator，之后将产生的 Operator 加入到等待队列。

       另外 scheduler-max-waiting-operator 参数限制 waitingOperator 队列中每类调度最大的 operator 数量(4.0版本后默认为5)，当 operator 数量达到参数值时则也不允许添加 operator，从而也会影响 operator 产生速度。在6.0版本中该参数被设置为了隐藏参数，通过 pd-ctl config show all 命令才能看到，可使用 pd-ctl config set 修改。

```markdown
$ pd-ctl -u 10.125.144.18:23791 config show | grep scheduler-max-waiting-operator
$pd-ctl -u 10.125.144.18:23791 config show all | grep scheduler-max-waiting-operator
 "scheduler-max-waiting-operator": 5
```

# 3 leader 调度加速实现

       leader 的均衡由 balance-leader-scheduler 调度器控制，每隔一定时间会进行一次调度，间隔的最小时间是10ms(MinScheduleInterval)，当调度失败次数达到10次后，会调整间隔时间，最大间隔时间不超5秒。

       理想情况下 balance-leader-scheduler 每隔10ms完成一次调度，1秒内最多产100个 operator，处理100个 region leader 的转移，当集群数据量很大时，当 TiKV 重启后，由于 operator 产生速度的影响导致 leader 调度速度，较长时间的不均衡容易引发性能问题。比如当有10万个 region leader 需要调度时完成 operator 的创建就得需要17分钟。

       一种优化方式就是在不减少调度间隔增加压力的情况下，通过每次调度产生多个 operator 以提升 operator 的产生速度，为此6.0版本中为 balance-leader-scheduler 添加了 batch 选项，通过 pd-ctl 工具修改，默认值为4(受 leader-schedule-limit、scheduler-max-waiting-operator 限制)，可选范围值为1-10，这样在每次 sheduler 调度时产生多个 operator，从而提升 transfer leader 速度。

```markdown
 $ pd-ctl -u pd-address:pd_port scheduler config balance-leader-scheduler set batch 6
 $ pd-ctl -u pd-address:pd_port scheduler config balance-leader-scheduler
 {
   "ranges": [
     {
       "start-key": "",
       "end-key": ""
     }
   ],
   "batch": 6
 } 
```

# 4 测试

## 4.1 测试环境

       3个 TiKV，每 TiKV 约3.5万个 region，总存储大小 13.2 TB。

## 4.2 测试方式

     每次测试前 stop tikv 然后修改相关参数后启动 TiKV，观察 TiKV 监控的 leader 均衡时间。

## 4.3 测试结果

不同参数值下 TiKV 重启后 leader 均衡时间

|     |                    |                          |           |                |
| --- | ------------------ | ------------------------ | --------- | -------------- |
|     | **schedule-limit** | **max-waiting-operator** | **batch** | **leader均衡时间** |
| 默认值 | 4                  | 5                        | 4         | 2分钟            |
| 旧版本 | 4                  | 5                        | 1         | 7分钟            |
| 较高值 | 10                 | 10                       | 10        | 1分钟            |
| 最低值 | 1                  | 1                        | 1         | 无法均衡           |

 

不同参数值下 TiKV 重启后 leader 监控

- **默认值**

&#x20;                                        ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431043722.png)   &#x20;

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431053692.png)

- &#x20;**旧版本**

       6.0 版本前 leader-scheduler 没有 batch 选项，通过设置选项值为1模拟。                                                                                                     &#x20;

&#x20;                            ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431107149.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431116948.png)

- **较高值**

                     ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431127744.png)

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431158583.png)

- **最低值：**

&#x20;                           ![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431173046.png)     &#x20;

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1652431189587.png)

         12:40 启动 TiKV 后一直未发生调度，12:46 调整 leader-schedule-limit=2 仍未发生调度，12:50调整 schedule-limit=1、max-waiting-operator=2 后开始调度。

       当 max-waiting-operator=1 时有大量的 transfer leader 请求被 cancel 而不能完成调度，经确认此为 bug。

&#x20;    \[2022/05/12 12:45:38.419 +08:00] \[INFO] \[operator\_controller.go:597] \["operator canceled"] \[region-id=28977] \[takes=0s] \[operator="\\"balance-leader {transfer leader: store 2 to 1} (kind:leader, region:28977(365, 35), createAt:2022-05-12 12:45:38.419949916 +0800 CST m=+418435.703819099, startAt:0001-01-01 00:00:00 +0000 UTC, currentStep:0, size:95, steps:\[transfer leader from store 2 to store 1])\\""] &#x20;

&#x20;       该问题原因是由于在 operator 加入到 waiting 队列后会进行一次检查，之后 wopStatus 会+1，当从 waiting 队列取出后会再次检查，导致 operator  被 cancel。对于生产系统保持默认即可。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1655715874584.png)

# 5 总结

         由于早期版本中对 balance-leader 的 operator 产生速度有限制，而 transfer leader 操作本身比较快，造成了整体 leader 均衡速度较慢，TiDB 6.0 版本通过增加 balance-leader-scheduler 每次调度时产生的 operator 数量，极大的缩短了 TiKV 重启后 leader 的整体迁移速度，降低因为长时间不均衡带来的性能影响，对于大集群的快速恢复提供了保障。 
