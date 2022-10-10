---
title: TiDB Operator 1.3.8 Release Notes - TiDB 社区技术月刊
sidebar_label: TiDB Operator 1.3.8 Release Notes
hide_title: true
description: 本篇为 TiDB Operator 1.3.8 Release Notes，包括新功能发布、优化提升等。
keywords: [TiDB Operator, Release Notes, 1.3.8, 新功能发布, 优化提升]
---

# TiDB Operator 1.3.8 Release Notes

发布日期：2022 年 9 月 13 日

TiDB Operator 版本：1.3.8

## 新功能

- 为 `TidbCluster` 添加一些特殊的 Annotation 以支持配置 TiDB、TiKV 和 TiFlash 的 Pod 的最小等待时间，最小等待时间指的是在滚动升级过程中新创建的 Pod 变为 Ready 所需要的最小时间 ([#4640](https://github.com/pingcap/tidb-operator/pull/4640), [@KanShiori](https://github.com/KanShiori))

## 优化提升

- 支持优雅升级版本大于或等于 6.3.0 的 TiCDC pod ([#4697](https://github.com/pingcap/tidb-operator/pull/4697), [@overvenus](https://github.com/overvenus))

[TiDB Operator 1.3.8 Release Notes](https://github.com/pingcap/docs-tidb-operator/blob/master/zh/releases/release-1.3.8.md)更新于 2022/9/13 13:31:26