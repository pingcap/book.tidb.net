---
title: pd-ctl 选项 --jq 格式化语法使用案例详解 - TiDB 社区技术月刊
sidebar_label: pd-ctl 选项 --jq 格式化语法使用案例详解
hide_title: true
description: 在阅读关于 PD Control 工具使用的文档时，发现文档未对 --jq 格式化选项的语法作太多详细介绍。于是，诞生了本文档，希望对如我这种新手小白有一定的帮助。
keywords: [TiDB, PD Control,  JSON]
---

# pd-ctl 选项 --jq 格式化语法使用案例详解

> 作者：OnTheRoad


## 1. json 格式化工具 jq

在阅读关于 PD Control 工具使用的文档时，发现文档未对 --jq 格式化选项的语法作太多详细介绍。于是，诞生了本文档，希望对如我这种新手小白有一定的帮助

### 1.1. jq 简介

在介绍 pd-ctl 的命令行选项 --jq之前，首先了解一下 Linux 中的命令行工具 jq。jq 是一个命令行的 JSON 文本格式化工具。jq 将给定的 Filter（过滤器）应用于其输入的 JSON 文本中，并将执行结果以 JSON 格式返回到标准输出中。

官方文档链接：https://stedolan.github.io/jq/manual/

### 1.2. jq 安装

```
# Install For CentOS7/RHEL7
～]$ sudo yum install -y jq

# Install For Ubuntu/Debian
～]$ sudo apt-get install jq
```

### 1.3. jq 使用

#### 1.3.1. 语法格式

```
jq [选项] <过滤器> [待处理的文件]
~]$ jq --help

jq - commandline JSON processor [version 1.6]

Usage:  jq [options] <jq filter> [file...]
        jq [options] --args <jq filter> [strings...]
        jq [options] --jsonargs <jq filter> [JSON_TEXTS...]

jq is a tool for processing JSON inputs, applying the given filter to its JSON text inputs and producing the filter's results as JSON on standard output.

The simplest filter is ., which copies jq's input to its output unmodified (except for formatting, but note that IEEE754 is used for number representation internally, with all that that implies).

For more advanced filters see the jq(1) manpage ("man jq") and/or https://stedolan.github.io/jq

Example:

        $ echo '{"foo": 0}' | jq .
        {
                "foo": 0
        }

Some of the options include:
  -c               compact instead of pretty-printed output;
  -n               use `null` as the single input value;
  -e               set the exit status code based on the output;
  -s               read (slurp) all inputs into an array; apply filter to it;
  -r               output raw strings, not JSON texts;
  -R               read raw strings, not JSON texts;
  -C               colorize JSON;
  -M               monochrome (don't colorize JSON);
  -S               sort keys of objects on output;
  --tab            use tabs for indentation;
  --arg a v        set variable $a to value <v>;
  --argjson a v    set variable $a to JSON value <v>;
  --slurpfile a f  set variable $a to an array of JSON texts read from <f>;
  --rawfile a f    set variable $a to a string consisting of the contents of <f>;
  --args           remaining arguments are string arguments, not files;
  --jsonargs       remaining arguments are JSON arguments, not files;
  --               terminates argument processing;

Named arguments are also available as $ARGS.named[], while
positional arguments are available as $ARGS.positional[].

See the manpage for more options.
```

#### 1.3.2. jq 常用示例

##### 1.3.2.1. 准备测试文本

首先，准备 2 份测试文件。文件1（`jsonstr.txt`）内容为一段未格式化的 JSON 字符串；文件2（`jsonfmt.txt`）内容为一段格式化后的 JSON 文本。

```
~]$ cat > jsonstr.txt << EOF
{"Skills": ["Oracle", "Python", "MySQL", "Latex"], "Age": 38, "Birthday": "19th Jan", "Name": "Jack", "Email": "Jack@outlook.com", "Education":{"University":"LNTU","College":"Electronics & Information Engineering","Professonal":"Computer Science & Technology","Year":"2007"}}
EOF
{
  "count": 3,
  "stores": [
    {
      "store": {
        "id": 1,
        "address": "192.168.3.225:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.225:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078152,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660965837130921869,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.7GiB",
        "used_size": "1.01GiB",
        "leader_count": 6,
        "leader_weight": 1,
        "leader_score": 6,
        "leader_size": 417,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6859819744.928351,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:32+08:00",
        "last_heartbeat_ts": "2022-08-20T11:23:57.130921869+08:00",
        "uptime": "524h21m25.130921869s"
      }
    },
    {
      "store": {
        "id": 4,
        "address": "192.168.3.224:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.224:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078147,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660965841338055613,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.69GiB",
        "used_size": "1.011GiB",
        "leader_count": 11,
        "leader_weight": 1,
        "leader_score": 11,
        "leader_size": 932,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6861359887.412361,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:27+08:00",
        "last_heartbeat_ts": "2022-08-20T11:24:01.338055613+08:00",
        "uptime": "524h21m34.338055613s"
      }
    },
    {
      "store": {
        "id": 5,
        "address": "192.168.3.226:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.226:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078162,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660965837041716427,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.69GiB",
        "used_size": "1.031GiB",
        "leader_count": 5,
        "leader_weight": 1,
        "leader_score": 5,
        "leader_size": 462,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6862644983.297757,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:42+08:00",
        "last_heartbeat_ts": "2022-08-20T11:23:57.041716427+08:00",
        "uptime": "524h21m15.041716427s"
      }
    }
  ]
}
```

> 【**注意】**该测试文本为一个 TiDB 集群数据库中的 store 信息。可通过如下方式获取类似格式的 JSON 文本。
>
> ```
> ~]$ tiup ctl:v6.1.0 pd -u http://192.168.3.221:2379 store > jsonfmt.txt
> ```
>
> 其中 `http://192.168.3.221:2379` 为 PD 实例的地址，获取的json信息通过`>`重定向输入到`jsonfmt.txt`。

##### 1.3.2.2. JSON 字符串格式化

1. 直接通过 jq 命令，格式化文本

```
~]$ jq --tab -S '.' jsonstr.txt
{
  "Skills": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ],
  "Age": 38,
  "Birthday": "19th Jan",
  "Name": "Jack",
  "Email": "Jack@outlook.com",
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professonal": "Computer Science & Technology",
    "Year": "2007"
  }
}
```

这里的过滤器`'.'`，表示只对输入的内容做 JSON 格式化，而不修改其内容，效果与下面的过滤器 'values' 一致。

```
~]$ cat jsonstr.txt | jq 'values'
{
  "Skills": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ],
  "Age": 38,
  "Birthday": "19th Jan",
  "Name": "Jack",
  "Email": "Jack@outlook.com",
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  }
}
```

1. 通过管道符调用 jq，格式化文本

```
~]$ cat jsonstr.txt | jq --tab -S '.'
{
        "Age": 38,
        "Birthday": "19th Jan",
        "Education": {
                "College": "Electronics & Information Engineering",
                "Professonal": "Computer Science & Technology",
                "University": "LNTU",
                "Year": "2007"
        },
        "Email": "Jack@outlook.com",
        "Name": "Jack",
        "Skills": [
                "1.Oracle",
                "2.Python",
                "3.MySQL",
                "4.Latex"
        ]
}
```

默认的缩进为 2 个空格，`--tab` 表示将缩进替换为 tab 制表符；`-S` 表示对格式化后的 JSON 文本按 `KEY` 排序。

> **【注意】**为简化描述，避免文档过于冗长，后续示例均以管道方式来描述 jq 的使用。

##### 1.3.2.3. 以列表形式获取 Key（只能获取 1 级的 Key 信息）

```
~]$ cat jsonstr.txt | jq 'keys'
[
  "Age",
  "Birthday",
  "Education",
  "Email",
  "Name",
  "Skills"
]
```

这里的 `keys` 为关键字

##### 1.3.2.4. 提取指定 Key 的 Value（Key Filter）

```
jq '.Key1名称, .Key2名称, ...'
```

1. 获取某个 Key 的 Value

当 JSON 文本过长，只想提取其中某个 Key 的 Value。可通过如下语法完成。

```
~]$ jq '.Education' jsonstr.txt 
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professonal": "Computer Science & Technology",
  "Year": "2007"
}


~]$ cat jsonstr.txt |jq '.Education'
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professonal": "Computer Science & Technology",
  "Year": "2007"
}
```

1. 获取某几个 Key 的 Value

逗号分隔多个 Key，可获取指定的多个 Key 的 Value。

```
~]$ cat jsonstr.txt | jq '.Education, .Skills'
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professnal": "Computer Science & Technology",
  "Year": "2007"
}
[
  "1.Oracle",
  "2.Python",
  "3.MySQL",
  "4.Latex"
]
```

##### 1.3.2.5. 提取指定 Key 的 KV（Key-Value Filter）

```
jq '{Key1名称}, {Key2名称}, ...'
```

1. 获取某个 Key 的 KV

```
~]$ cat jsonstr.txt | jq '{Education}'
{
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  }
}
```

1. 获取多个 Key 的 KV

```
~]$ cat jsonstr.txt | jq '{Education}, {Skills}'
{
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  }
}
{
  "Skills": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ]
}
```

##### 1.3.2.6. 通过 ‘.<Key名称>[]’ 递归指定 Key 下的 Value 信息

1. 递归获取 1 级的所有 Value

不指定 Key 名称时，则获取 1 级的 Value 信息

```
~]$ cat jsonstr.txt | jq '.[]'
[
  "1.Oracle",
  "2.Python",
  "3.MySQL",
  "4.Latex"
]
38
"19th Jan"
"Jack"
"Jack@outlook.com"
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professnal": "Computer Science & Technology",
  "Year": "2007"
}
```

1. 获取 `Education`下的所有 Value 信息

指定 Key 名称时，则获取指定 Key 下的所有 Value 信息

```
~]$ cat jsonstr.txt | jq '.Education[]'
"LNTU"
"Electronics & Information Engineering"
"Computer Science & Technology"
"2007"
```

> 注意过滤器 `'.Education[]'` 与 `'.Education'` 的区别。
>
> ```
> ~]$ cat jsonstr.txt | jq '.Education'
> {
>  "University": "LNTU",
>  "College": "Electronics & Information Engineering",
>  "Professnal": "Computer Science & Technology",
>  "Year": "2007"
> }
> ```

##### 1.3.2.7. 通过 select 检索包含指定 KV 的内容

```
# 通过 .stores[] 递归取出 stores 中每个元素（元素中包含store和status两部分内容）；
# 再通过 .store 过滤出每个元素中的 store 部分的内容。
~]$ cat jsonfmt.txt | jq '.stores[].store'
{
  "id": 1,
  "address": "192.168.3.225:20160",
  "version": "6.1.0",
  "status_address": "192.168.3.225:20180",
  "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
  "start_timestamp": 1659078152,
  "deploy_path": "/tidb-deploy/tikv-20160/bin",
  "last_heartbeat": 1660966497198077000,
  "state_name": "Up"
}
{
  "id": 4,
  "address": "192.168.3.224:20160",
  "version": "6.1.0",
  "status_address": "192.168.3.224:20180",
  "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
  "start_timestamp": 1659078147,
  "deploy_path": "/tidb-deploy/tikv-20160/bin",
  "last_heartbeat": 1660966491404376800,
  "state_name": "Up"
}
{
  "id": 5,
  "address": "192.168.3.226:20160",
  "version": "6.1.0",
  "status_address": "192.168.3.226:20180",
  "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
  "start_timestamp": 1659078162,
  "deploy_path": "/tidb-deploy/tikv-20160/bin",
  "last_heartbeat": 1660966497108902000,
  "state_name": "Up"
}

# 通过 .stores[].store 过滤出多个 store
# 对多个 store 应用 select 条件（id ==5）查询，筛选出包含 id == 5 的 store。
~]$ cat jsonfmt.txt | jq '.stores[].store | select(.id == 5)'
{
  "id": 5,
  "address": "192.168.3.226:20160",
  "version": "6.1.0",
  "status_address": "192.168.3.226:20180",
  "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
  "start_timestamp": 1659078162,
  "deploy_path": "/tidb-deploy/tikv-20160/bin",
  "last_heartbeat": 1660966497108902000,
  "state_name": "Up"
}
```

##### 1.3.2.8. 列表中的元素提取或切片（Index Filter）

当某个 Key 对应的 Value 是一个列表时，jq 可通过如下语法对 Value 进行元素提取或切片。

1. 列表中单个元素的提取

```
jq '.Key名称[元素下标,元素下标,,]'
~]$ cat jsonstr.txt | jq '.Skills[]'
"1.Oracle"
"2.Python"
"3.MySQL"
"4.Latex"

~]$ cat jsonstr.txt | jq '.Skills[0]'
"1.Oracle"
~]$ cat jsonstr.txt | jq '.Skills[1]'
"2.Python"
~]$ cat jsonstr.txt | jq '.Skills[-2]'
"3.MySQL"
~]$ cat jsonstr.txt | jq '.Skills[1,3]'
"2.Python"
"4.Latex"
```

1. 列表中连续多个元素的切片

```
jq '.Key名称[起始下标:结束下标（不含）]'
```

`[切片起始下标:切片结束下标（不含）]` 切片区间是一个左闭右开的区间，即`[起始下标, 结束下标)`，并且 `结束下标` 需大于 `起始下标`。如 `[1,3]` 表示提取下标为 `1 至 3，但不包含 3` 的元素。

当下标为负数时，表示从末尾反向计算下标。倒数第1个元素下标为`-1`，倒数第2个为 `-2` 依次类推。

![image.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/image-1660988702328.png)

```
~]$ cat jsonstr.txt | jq '.Skills[0]'
"1.Oracle"
~]$ cat jsonstr.txt | jq '.Skills[0:1]'
[
  "1.Oracle"
]

~]$ cat jsonstr.txt | jq '.Skills[0:2]'
[
  "1.Oracle",
  "2.Python"
]

~]$ cat jsonstr.txt | jq '.Skills[1:10]'
[
  "2.Python",
  "3.MySQL",
  "4.Latex"
]

~]$ cat jsonstr.txt | jq '.Skills[-2,3]'
"3.MySQL"
"4.Latex"

~]$ cat jsonstr.txt | jq '.Skills[-2:1]'
[]
```

注意与 Python 列表切片的区别

##### 1.3.2.9. 管道嵌套

1. 利用管道符，计算每个 Key 的 Value 长度

```
~]$ cat jsonstr.txt | jq '.Education'
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professnal": "Computer Science & Technology",
  "Year": "2007"
}

~]$ cat jsonstr.txt | jq '.Education | length'
4
```

length 过滤器，计算元素长度。对于对象，表示对象里的元素个数；对于字符串，表示字符串字符数；对于列表，表示列表元素个数。

1. 利用管道符，逐级过滤

```
~]$ cat jsonstr.txt | jq '.Education | .College'
"Electronics & Information Engineering"
```

##### 1.3.2.10. 递归展开所有层级的 KV

```
~]$ cat jsonstr.txt | jq '..'
{
  "Skills": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ],
  "Age": 38,
  "Birthday": "19th Jan",
  "Name": "Jack",
  "Email": "Jack@outlook.com",
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  }
}
[
  "1.Oracle",
  "2.Python",
  "3.MySQL",
  "4.Latex"
]
"1.Oracle"
"2.Python"
"3.MySQL"
"4.Latex"
38
"19th Jan"
"Jack"
"Jack@outlook.com"
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professnal": "Computer Science & Technology",
  "Year": "2007"
}
"LNTU"
"Electronics & Information Engineering"
"Computer Science & Technology"
"2007"
```

##### 1.3.2.11. map 或 map_value 列表遍历

1. 通过 map 遍历每个 KEY，并应用 length 计算每个 Key 对应的 Value 长度

针对对象，计算其元素个数；针对字符串计算其字符串长度。

```
~]$ cat jsonstr.txt | jq 'map(. | length)'
[
  4,
  38,
  8,
  4,
  16,
  4
]
```

##### 1.3.2.12. 重构 JSON（[]与{}）

用各种 Filter 格式化后的 JSON 内容，可通过 `[]` 和 `{}` 来重新组织，生成新的 JSON 文本。

```
~]$ cat jsonstr.txt | jq '.Education, .Skills'
{
  "University": "LNTU",
  "College": "Electronics & Information Engineering",
  "Professnal": "Computer Science & Technology",
  "Year": "2007"
}
[
  "1.Oracle",
  "2.Python",
  "3.MySQL",
  "4.Latex"
]
```

1. 利用 `[]`，将输出重新组织成列表

```
~]$ cat jsonstr.txt | jq '[.Education, .Skills]'
[
  {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  },
  [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ]
]
```

1. 利用 `{}`，将输出重新组织成 JSON 对象

```
~]$ cat jsonstr.txt | jq '{Education, Skills}'
{
  "Education": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  },
  "Skills": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ]
}
```

1. 利用 `{}`，重构 JSON对象，并指定新的 Key 名称。

```
~]$ cat jsonstr.txt | jq '{EducationDetail: .Education, SkillInfo: .Skills}'
{
  "EducationDetail": {
    "University": "LNTU",
    "College": "Electronics & Information Engineering",
    "Professnal": "Computer Science & Technology",
    "Year": "2007"
  },
  "SkillInfo": [
    "1.Oracle",
    "2.Python",
    "3.MySQL",
    "4.Latex"
  ]
}
~]$ cat jsonstr.txt | jq '{EducationDetail: {Education}, SkillInfo: {Skills}}'
{
  "EducationDetail": {
    "Education": {
      "University": "LNTU",
      "College": "Electronics & Information Engineering",
      "Professnal": "Computer Science & Technology",
      "Year": "2007"
    }
  },
  "SkillInfo": {
    "Skills": [
      "1.Oracle",
      "2.Python",
      "3.MySQL",
      "4.Latex"
    ]
  }
}
```

##2. PD Control 中通过 jq 格式化输出

### 2.1. pd-ctl 命令的 --jq 选项使用说明

了解 jq 的常见使用方式后，便可通过如下三种方式，格式化输出 PD 的配置信息：

1. 在使用 pd-ctl 工具时指定 `--jq <过滤器>` 来格式化 PD 配置信息的输出。`--jq` 本质上也是调用系统中的 jq 工具，来执行格式化输出。因此，其该参数的语法与 `jq` 完全一致。
2. 可利用管道符`|`，将 PD 配置信息的内容重定向到 `jq` 命令，作格式化输出。
3. 混合使用 pd-ctl 的 `--jq` 选项与 `jq` 命令。

> **【注意】**因 pd-ctl 的 `--jq`选项本质上就是调用系统中的 `jq` 命令，因此系统中需要安装 `jq` 工具包。

### 2.2. 常用 jq 格式化 PD 配置信息示例

#### 2.2.1. 格式化显示 PD 实例信息

1. 格式化显示完整的 PD 调度信息

```
~]$ export PD_ADDR=http://192.168.3.222:2379
~]$ tiup ctl:v6.1.0 pd config show
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd config show
{
  "replication": {
    "enable-placement-rules": "true",
    "enable-placement-rules-cache": "false",
    "isolation-level": "",
    "location-labels": "",
    "max-replicas": 3,
    "strictly-match-label": "false"
  },
  "schedule": {
    "enable-cross-table-merge": "true",
    "enable-joint-consensus": "true",
    "high-space-ratio": 0.7,
    "hot-region-cache-hits-threshold": 3,
    "hot-region-schedule-limit": 4,
    "hot-regions-reserved-days": 0,
    "hot-regions-write-interval": "10m0s",
    "leader-schedule-limit": 4,
    "leader-schedule-policy": "count",
    "low-space-ratio": 0.8,
    "max-merge-region-keys": 200000,
    "max-merge-region-size": 20,
    "max-pending-peer-count": 64,
    "max-snapshot-count": 64,
    "max-store-down-time": "30m0s",
    "max-store-preparing-time": "48h0m0s",
    "merge-schedule-limit": 8,
    "patrol-region-interval": "10ms",
    "region-schedule-limit": 2048,
    "region-score-formula-version": "v2",
    "replica-schedule-limit": 64,
    "split-merge-interval": "1h0m0s",
    "tolerant-size-ratio": 0
  }
}
```

1. 格式化显示完整的 Store 信息

```
~]$ tiup ctl:v6.1.0 pd store
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd store
{
  "count": 3,
  "stores": [
    {
      "store": {
        "id": 1,
        "address": "192.168.3.225:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.225:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078152,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660978688453748544,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.7GiB",
        "used_size": "1.011GiB",
        "leader_count": 6,
        "leader_weight": 1,
        "leader_score": 6,
        "leader_size": 417,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6860013051.732055,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:32+08:00",
        "last_heartbeat_ts": "2022-08-20T14:58:08.453748544+08:00",
        "uptime": "527h55m36.453748544s"
      }
    },
    {
      "store": {
        "id": 4,
        "address": "192.168.3.224:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.224:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078147,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660978692660915975,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.69GiB",
        "used_size": "1.011GiB",
        "leader_count": 11,
        "leader_weight": 1,
        "leader_score": 11,
        "leader_size": 932,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6861560216.947071,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:27+08:00",
        "last_heartbeat_ts": "2022-08-20T14:58:12.660915975+08:00",
        "uptime": "527h55m45.660915975s"
      }
    },
    {
      "store": {
        "id": 5,
        "address": "192.168.3.226:20160",
        "version": "6.1.0",
        "status_address": "192.168.3.226:20180",
        "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
        "start_timestamp": 1659078162,
        "deploy_path": "/tidb-deploy/tikv-20160/bin",
        "last_heartbeat": 1660978688364585582,
        "state_name": "Up"
      },
      "status": {
        "capacity": "19.56GiB",
        "available": "15.69GiB",
        "used_size": "1.031GiB",
        "leader_count": 5,
        "leader_weight": 1,
        "leader_score": 5,
        "leader_size": 462,
        "region_count": 22,
        "region_weight": 1,
        "region_score": 6862846131.837539,
        "region_size": 1811,
        "slow_score": 1,
        "start_ts": "2022-07-29T15:02:42+08:00",
        "last_heartbeat_ts": "2022-08-20T14:58:08.364585582+08:00",
        "uptime": "527h55m26.364585582s"
      }
    }
  ]
}
```

1. 格式化显示完整的 Region 信息

```
~]$ tiup ctl:v6.1.0 pd region | jq '.'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region
{
  "count": 22,
  "regions": [
    {
      "id": 172,
      "start_key": "7480000000000000FF5C00000000000000F8",
      "end_key": "7480000000000000FF5E00000000000000F8",
      "epoch": {
        "conf_ver": 47,
        "version": 68
      },
      "peers": [
        {
          "id": 173,
          "store_id": 1,
          "role_name": "Voter"
        },
        {
          "id": 4467,
          "store_id": 4,
          "role_name": "Voter"
        },
        {
          "id": 4497,
          "store_id": 5,
          "role_name": "Voter"
        }
      ],
      "leader": {
        "id": 4467,
        "store_id": 4,
        "role_name": "Voter"
      },
      "written_bytes": 0,
      "read_bytes": 0,
      "written_keys": 0,
      "read_keys": 0,
      "approximate_size": 85,
      "approximate_keys": 1079434
    },
    ......
    
]
}
```

#### 2.2.2. 按需查询 Store 信息

##### 2.2.2.1. 简化查询 Store 信息

1. 通过 `KV Filter` 过滤出 `store` 与 `status` 完整信息

```
~]$ tiup ctl:v6.1.0 pd store --jq=".stores[]" |jq '{store}, {status}'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd store --jq=.stores[]
{
  "store": {
    "id": 4,
    "address": "192.168.3.224:20160",
    "version": "6.1.0",
    "status_address": "192.168.3.224:20180",
    "git_hash": "080d086832ae5ce2495352dccaf8df5d40f30687",
    "start_timestamp": 1659078147,
    "deploy_path": "/tidb-deploy/tikv-20160/bin",
    "last_heartbeat": 1660980592856686300,
    "state_name": "Up"
  }
}
{
  "status": {
    "capacity": "19.56GiB",
    "available": "15.69GiB",
    "used_size": "1.012GiB",
    "leader_count": 11,
    "leader_weight": 1,
    "leader_score": 11,
    "leader_size": 932,
    "region_count": 22,
    "region_weight": 1,
    "region_score": 6861587385.861746,
    "region_size": 1811,
    "slow_score": 1,
    "start_ts": "2022-07-29T15:02:27+08:00",
    "last_heartbeat_ts": "2022-08-20T15:29:52.856686305+08:00",
    "uptime": "528h27m25.856686305s"
  }
}
......
```

1. 筛选字段，重构 JSON 文本

首先，通过 `KV Filter` 筛选出 `store.id`、`store.address`、`store.state_name`、`status.available` 字段；再通过 `{}` 重构 JSON 内容，重构时指定新的 KEY 字段名称。

```
~]$ tiup ctl:v6.1.0 pd store --jq=".stores[]" |jq '{store_id: .store.id, addr: .store.address, state: .store.state_name, freespace: .status.available}'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd store --jq=.stores[]
{
  "store_id": 1,
  "addr": "192.168.3.225:20160",
  "state": "Up",
  "freespace": "15.7GiB"
}
{
  "store_id": 4,
  "addr": "192.168.3.224:20160",
  "state": "Up",
  "freespace": "15.69GiB"
}
{
  "store_id": 5,
  "addr": "192.168.3.226:20160",
  "state": "Up",
  "freespace": "15.69GiB"
}
```

##### 2.2.2.2. 按序查询状态为 Down 的 Store 信息

```
~]$ tiup ctl:v6.1.0 pd store --jq=".stores[]" |jq '{store_id: .store.id, addr: .store.address, state: .store.state_name, freespace: .status.available}' | jq '. | select(.state="Up")'
```

##### 2.2.2.3. 查询 TiKV 的信息

判断 Store 为 TiKV 的依据为 “如果 Store 的部署目录为 `/tidb-deploy/tikv-20160/bin`，则可断定其为 TiKV”。依据的前提是，各组件均规范化部署。

```
~]$ tiup ctl:v6.1.0 pd store --jq=".stores[]" |jq '{store_id: .store.id, addr: .store.address, state: .store.state_name, path: .store.deploy_path, freespace: .status.available}' |jq '. |select(.path == "/tidb-deploy/tikv-20160/bin")'

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd store --jq=.stores[]
{
  "store_id": 1,
  "addr": "192.168.3.225:20160",
  "state": "Up",
  "path": "/tidb-deploy/tikv-20160/bin",
  "freespace": "15.7GiB"
}
{
  "store_id": 4,
  "addr": "192.168.3.224:20160",
  "state": "Up",
  "path": "/tidb-deploy/tikv-20160/bin",
  "freespace": "15.69GiB"
}
{
  "store_id": 5,
  "addr": "192.168.3.226:20160",
  "state": "Up",
  "path": "/tidb-deploy/tikv-20160/bin",
  "freespace": "15.69GiB"
}
```

#### 2.2.3. 按序查询 Region 信息

##### 2.2.3.1. 查看 Region 总体分布情况

1. 查看 Region 分布情况，包括 Region ID、副本分布、Leader分布

```
~]$ tiup ctl:v6.1.0 pd region | jq '.regions[] | {region_id: .id, peer_stores: [.peers[].store_id], leader_store: .leader.store_id}'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region
{
  "region_id": 192,
  "peer_stores": [
    1,
    5,
    4
  ],
  "leader_store": 4
}
{
  "region_id": 244,
  "peer_stores": [
    5,
    1,
    4
  ],
  "leader_store": 5
}
......
```

1. 查看 Region 分布情况，包括 Region ID、起始Key值、副本分布、Leader分布

```
~]$ tiup ctl:v6.1.0 pd region | jq '.regions[] | {region_id: .id, key: [.start_key,.end_key], peer_stores: [.peers[].store_id], leader_store: .leader.store_id}'

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region
{
  "region_id": 196,
  "key": [
    "7480000000000000FF645F728000000000FF04F8C70000000000FA",
    "7480000000000000FF645F728000000000FF0630A00000000000FA"
  ],
  "peer_stores": [
    1,
    4,
    5
  ],
  "leader_store": 4
}
{
  "region_id": 204,
  "key": [
    "7480000000000000FF645F728000000000FF09CDB50000000000FA",
    "7480000000000000FF645F728000000000FF0D6E840000000000FA"
  ],
  "peer_stores": [
    5,
    4,
    1
  ],
  "leader_store": 4
}
......
```

##### 2.2.3.2. 根据 Region 副本数，过滤 Region

查找副本数不等于3的Region

```
~]$ tiup ctl:v6.1.0 pd region --jq=".regions[]" | jq '{region_id: .id, peer_stores: [.peers[].store_id] | select(length != 3)}'

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region --jq=.regions[]
{
  "region_id": 252,
  "peer_stores": [
    4,
    5
  ]
}
{
  "region_id": 216,
  "peer_stores": [
    1,
    4
  ]
}
```

##### 2.2.3.3. 查询指定 Store 上的 Region

查看 Store ID 为 4 上的 Region。

```
~]$ tiup ctl:v6.1.0 pd region |jq '.regions[] | {region_id: .id, peer_stores: [.peers[].store_id] | select(any(.==4))}'

Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region
{
  "region_id": 252,
  "peer_stores": [
    1,
    4,
    5
  ]
}
{
  "region_id": 216,
  "peer_stores": [
    5,
    1,
    4
  ]
}
......
~]$ tiup ctl:v6.1.0 pd region |jq '.regions[] | {region_id: .id, peer_stores: [.peers[].store_id] | select(any(.==(1,4)))}'
```

##### 2.2.3.4. 查询指定 Store 上的 Leader

查询指定 Store 上的 Leade，以及该 Leader 的其他副本分布情况。

```
~]$ tiup ctl:v6.1.0 pd region | jq '.regions[] | select(.leader.store_id == 1) | {region_id: .id, peer_stores: [.peers[].store_id]}'
Starting component `ctl`: /home/tidb/.tiup/components/ctl/v6.1.0/ctl pd region
{
  "region_id": 200,
  "peer_stores": [
    5,
    4,
    1
  ]
}
{
  "region_id": 180,
  "peer_stores": [
    5,
    4,
    1
  ]
}
```