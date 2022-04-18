# 由于 Placement Rule 设置不合理导致 TiKV 节点不均衡

解决方案 -  Yilong Rong   更新于 2022.03.01

中文

## Issue

查看监控 TiKV-Detail Cluster 界面节点不均衡，总容量相同 3.9T的情况下，TiKV 1，5，6，8 等节点容量使用很少。

﻿![image.png](https://pingcap-knowledge-base.oss-cn-beijing.aliyuncs.com/u/4/f/image1642994444571.png)﻿

## Root Cause

**注意：请先查看 Diagnostic Steps 步骤，root cause 中的内容需要结合诊断步骤来看。**

由于 Placement rule 中 voter role 的 count 数量为 5，并且 location labels 为 [TorName,host]。所以 5 副本在分配时，首先按照 TorName [tor-2722,tor-2836,tor-2833,tor-2895,tor-2896,tor-2884] 分配 5 副本。

由于 tor-2884 中有 4 个 TiKV 节点，tor-2896 中有 2 个 TiKV 节点，其他 tor 只有 1 个 TiKV 节点。所以 tor-2884 中的 TiKV region count 数量会比较少，和只有 1 个 TiKV 节点的 TorName 相比，接近于 1:4。

## Diagnostic Steps

1. 使用 [pd control](https://docs.pingcap.com/zh/tidb/stable/pd-control/#pd-control-使用说明)  命令查看 store 结果（对比 TiKV-7 和 TiKV-8，展示信息删除了部分内容），可以看到 TiKV 7 和 TiKV8 总容量 3.58 T，但是 TiKV7  region 数量 80374 是 TiKV8 region 数量 26999 的几乎 4 倍。同时 TiKV 8 的 available 容量有 3 T。按照 PD 调度均衡规则，空间可用的情况下，TiKV 8 的 region 数量应该与 TiKV7 接近。
   1. 首先想到的是 leader weight 和 region weight 配置不同，但是显示结果都是默认值 1，可以排除此种情况。
   2. 配置了 label ，有调度规则的影响，可以看到结果中也有 laebls 信息，按照此思路继续排查

```markdown
"store": {
        "id": 7,
        "labels": [
          {
            "key": "host",
            "value": "tidb37"
          },
          {
            "key": "TorName",
            "value": "tor-2722"
          }
        ],
      },
      "status": {
        "capacity": "3.581TiB",
        "available": "1.745TiB",
        "used_size": "1.831TiB",
        "leader_count": 10698,
        "leader_weight": 1,
        "leader_score": 10698,
        "leader_size": 926915,
        "region_count": 80374,
        "region_weight": 1,
        "region_score": 6992990,
        "region_size": 6992990
      }
    }

"store": {
        "id": 8,
        "labels": [
          {
            "key": "host",
            "value": "tidb41"
          },
          {
            "key": "TorName",
            "value": "tor-2884"
          }
        ],
      },
      "status": {
        "capacity": "3.581TiB",
        "available": "3.01TiB",
        "used_size": "577.7GiB",
        "leader_count": 10695,
        "leader_weight": 1,
        "leader_score": 10695,
        "leader_size": 930228,
        "region_count": 26999,
        "region_weight": 1,
        "region_score": 2347574,
        "region_size": 2347574,
      }
    }
```

1. 查看 PD control 中 config show 中 location-labels 信息，结果为空，并非使用 location-labels 配置。下一步需要考虑的是使用了 Placement rule 规则

```markdown
"location-labels": ""
```

1. 使用 PD control 中 config placement-rules show 查看 placement rule 规则，可以看到配置了 location_labels [TorName,host]

```markdown
  {
    "group_id": "pd",
    "id": "default",
    "start_key": "",
    "end_key": "",
    "role": "voter",
    "count": 5,
    "location_labels": [
      "TorName",
      "host"
    ]
  }
```

1. 根据完整 store 信息可以统计出以下结果,可以看出 
   1. TiKV 6，8，10，5 在同一个 TorName tor-2884
   2. TiKV 1，9 在同一个 TorName tor-2896

| store id | region_count | TorName  | host   |
| -------- | ------------ | -------- | ------ |
| 7        | 80374        | tor-2722 | tidb37 |
| 4        | 80643        | tor-2836 | tidb44 |
| 11       | 79944        | tor-2883 | tidb56 |
| 12       | 79964        | tor-2895 | tidb38 |
| 1        | 53676        | tor-2896 | tidb39 |
| 9        | 53299        | tor-2896 | tidb54 |
| 6        | 26397        | tor-2884 | tidb49 |
| 8        | 26999        | tor-2884 | tidb41 |
| 10       | 26453        | tor-2884 | tidb46 |
| 5        | 27126        | tor-2884 | tidb53 |

﻿

## Resolution

Placement Rule 规则限制，预期结果。可以根据需要对 Placement Rule 进行调整。

