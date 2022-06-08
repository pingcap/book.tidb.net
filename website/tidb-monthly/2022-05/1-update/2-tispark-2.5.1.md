---
title: TiSpark 2.5.1
hide_title: true
---

# TiSpark 2.5.1

## Fixes

- Fix limit not push down bug [#2335](https://github.com/pingcap/tispark/pull/2335)
- Fix ClassCastException when cluster index with type Timestamp and Date [#2323](https://github.com/pingcap/tispark/pull/2323)
- Upgrade jackson-databind from 2.9.10.8 to 2.12.6.1 [#2288](https://github.com/pingcap/tispark/pull/2288)
- Fix the wrong result of _tidb_rowid [#2278](https://github.com/pingcap/tispark/pull/2278)
- Fix set catalog throw NoSuchElementException [#2254](https://github.com/pingcap/tispark/pull/2254)

## Documents

- Add limitation: TLS is not supported [#2281](https://github.com/pingcap/tispark/pull/2281)
- Add limitation: new collations are not supported [#2251](https://github.com/pingcap/tispark/pull/2251)
- Update communication channels [#2244](https://github.com/pingcap/tispark/pull/2244)