---
title: TiDB 和 Java 的简单 CRUD 应用程序 - TiDB 社区技术月刊
sidebar_label: TiDB 和 Java 的简单 CRUD 应用程序
hide_title: true
description: 本文将展示如何使用 TiDB 和 Java 来构造一个简单的 CRUD 应用程序。
keywords: [TiDB, Java, CRUD, 应用程序, 云原生]
---

# TiDB 和 Java 的简单 CRUD 应用程序

> 作者：王琦智

本文将展示如何使用 TiDB 和 Java 来构造一个简单的 CRUD 应用程序。

> **注意：**
> 推荐使用 Java 8 及以上版本进行 TiDB 的应用程序的编写。

> **建议：**
> 如果你希望使用 Spring Boot 进行 TiDB 应用程序的编写，可以查看 [Build the TiDB Application using Spring Boot](https://docs.pingcap.com/zh/tidb/stable/dev-guide-sample-application-spring-boot)。

## 第 1 步：启动你的 TiDB 集群

本节将介绍 TiDB 集群的启动方法。

### 使用 TiDB Cloud 免费集群

[创建免费集群](https://docs.pingcap.com/zh/tidb/stable/dev-guide-build-cluster-in-cloud#第-1-步创建免费集群)。

### 使用本地集群

此处将简要叙述启动一个测试集群的过程，若需查看正式环境集群部署，或查看更详细的部署内容，请查阅[本地启动 TiDB](https://docs.pingcap.com/zh/tidb/stable/quick-start-with-tidb)。

**部署本地测试集群**

适用场景：利用本地 macOS 或者单机 Linux 环境快速部署 TiDB 测试集群，体验 TiDB 集群的基本架构，以及 TiDB、TiKV、PD、监控等基础组件的运行

1. 下载并安装 TiUP。

   {{< copyable "shell-regular" >}}

   ```
   curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh
   ```

2. 声明全局环境变量。

   > **注意：**
   >
   > TiUP 安装完成后会提示对应 profile 文件的绝对路径。在执行以下 source 命令前，需要根据 profile 文件的实际位置修改命令。

   {{< copyable "shell-regular" >}}

   ```
   source .bash_profile
   ```

3. 在当前 session 执行以下命令启动集群。

   - 直接执行 `tiup playground` 命令会运行最新版本的 TiDB 集群，其中 TiDB、TiKV、PD 和 TiFlash 实例各 1 个：

     {{< copyable "shell-regular" >}}

     ```
     tiup playground
     ```

   - 也可以指定 TiDB 版本以及各组件实例个数，命令类似于：

     {{< copyable "shell-regular" >}}

     ```
     tiup playground v5.4.0 --db 2 --pd 3 --kv 3
     ```

     上述命令会在本地下载并启动某个版本的集群（例如 v5.4.0）。最新版本可以通过执行`tiup list tidb` 来查看。运行结果将显示集群的访问方式：

     ```
     CLUSTER START SUCCESSFULLY, Enjoy it ^-^
     To connect TiDB: mysql --comments --host 127.0.0.1 --port 4001 -u root -p (no password)
     To connect TiDB: mysql --comments --host 127.0.0.1 --port 4000 -u root -p (no password)
     To view the dashboard: http://127.0.0.1:2379/dashboard
     PD client endpoints: [127.0.0.1:2379 127.0.0.1:2382 127.0.0.1:2384]
     To view the Prometheus: http://127.0.0.1:9090
     To view the Grafana: http://127.0.0.1:3000
     ```

> **注意：**
>
> - 支持 v5.2.0 及以上版本的 TiDB 在 Apple M1 芯片的机器上运行 `tiup playground`。
> - 以这种方式执行的 playground，在结束部署测试后 TiUP 会清理掉原集群数据，重新执行该命令后会得到一个全新的集群。
> - 若希望持久化数据，可以执行 TiUP 的 `--tag` 参数：`tiup --tag <your-tag> playground ...`，详情参考 [TiUP 参考手册](https://docs.pingcap.com/zh/tidb/stable/tiup-reference#-t---tag-string)。


### 使用云原生开发环境

基于 Git 的预配置的开发环境: [现在就试试](https://docs.pingcap.com/zh/tidb/stable/dev-guide-playground-gitpod)

该环境会自动克隆代码，并通过 TiUP 部署测试集群。


## 第 2 步：获取代码

```
git clone https://github.com/pingcap-inc/tidb-example-java.git
```

- 使用 JDBC
- 使用 Mybatis（推荐）
- 使用 Hibernate（推荐）

进入目录 `plain-java-jdbc`：

```
cd plain-java-jdbc
```

目录结构如下所示：

```
.
├── Makefile
├── plain-java-jdbc.iml
├── pom.xml
└── src
    └── main
        ├── java
        │   └── com
        │       └── pingcap
        │            └── JDBCExample.java
        └── resources
            └── dbinit.sql
```

其中，`dbinit.sql` 为数据表初始化语句：

```
USE test;
DROP TABLE IF EXISTS player;

CREATE TABLE player (
    `id` VARCHAR(36),
    `coins` INTEGER,
    `goods` INTEGER,
   PRIMARY KEY (`id`)
);
```

`JDBCExample.java` 是 `plain-java-jdbc` 这个示例程序的主体。因为 TiDB 与 MySQL 协议兼容，因此，需要初始化一个 MySQL 协议的数据源 `MysqlDataSource`，以此连接到 TiDB。并在其后，初始化 `PlayerDAO`，用来管理数据对象，进行增删改查等操作。

`PlayerDAO` 是程序用来管理数据对象的类。其中 `DAO` 是 [Data Access Object](https://en.wikipedia.org/wiki/Data_access_object) 的缩写。在其中定义了一系列数据的操作方法，用来对提供数据的写入能力。

`PlayerBean` 是数据实体类，为数据库表在程序内的映射。`PlayerBean` 的每个属性都对应着 `player` 表的一个字段。

```
package com.pingcap;

import com.mysql.cj.jdbc.MysqlDataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.*;

/**
 * Main class for the basic JDBC example.
 **/
public class JDBCExample
{
    public static class PlayerBean {
        private String id;
        private Integer coins;
        private Integer goods;

        public PlayerBean() {
        }

        public PlayerBean(String id, Integer coins, Integer goods) {
            this.id = id;
            this.coins = coins;
            this.goods = goods;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Integer getCoins() {
            return coins;
        }

        public void setCoins(Integer coins) {
            this.coins = coins;
        }

        public Integer getGoods() {
            return goods;
        }

        public void setGoods(Integer goods) {
            this.goods = goods;
        }

        @Override
        public String toString() {
            return String.format("    %-8s => %10s\n    %-8s => %10s\n    %-8s => %10s\n",
                    "id", this.id, "coins", this.coins, "goods", this.goods);
        }
    }

    /**
     * Data access object used by 'ExampleDataSource'.
     * Example for CURD and bulk insert.
     */
    public static class PlayerDAO {
        private final MysqlDataSource ds;
        private final Random rand = new Random();

        PlayerDAO(MysqlDataSource ds) {
            this.ds = ds;
        }

        /**
         * Create players by passing in a List of PlayerBean.
         *
         * @param players Will create players list
         * @return The number of create accounts
         */
        public int createPlayers(List<PlayerBean> players){
            int rows = 0;

            Connection connection = null;
            PreparedStatement preparedStatement = null;
            try {
                connection = ds.getConnection();
                preparedStatement = connection.prepareStatement("INSERT INTO player (id, coins, goods) VALUES (?, ?, ?)");
            } catch (SQLException e) {
                System.out.printf("[createPlayers] ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
                e.printStackTrace();

                return -1;
            }

            try {
                for (PlayerBean player : players) {
                    preparedStatement.setString(1, player.getId());
                    preparedStatement.setInt(2, player.getCoins());
                    preparedStatement.setInt(3, player.getGoods());

                    preparedStatement.execute();
                    rows += preparedStatement.getUpdateCount();
                }
            } catch (SQLException e) {
                System.out.printf("[createPlayers] ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
                e.printStackTrace();
            } finally {
                try {
                    connection.close();
                } catch (SQLException e) {
                    e.printStackTrace();
                }
            }

            System.out.printf("\n[createPlayers]:\n    '%s'\n", preparedStatement);
            return rows;
        }

        /**
         * Buy goods and transfer funds between one player and another in one transaction.
         * @param sellId Sell player id.
         * @param buyId Buy player id.
         * @param amount Goods amount, if sell player has not enough goods, the trade will break.
         * @param price Price should pay, if buy player has not enough coins, the trade will break.
         *
         * @return The number of effected players.
         */
        public int buyGoods(String sellId, String buyId, Integer amount, Integer price) {
            int effectPlayers = 0;

            Connection connection = null;
            try {
                connection = ds.getConnection();
            } catch (SQLException e) {
                System.out.printf("[buyGoods] ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
                e.printStackTrace();
                return effectPlayers;
            }

            try {
                connection.setAutoCommit(false);

                PreparedStatement playerQuery = connection.prepareStatement("SELECT * FROM player WHERE id=? OR id=? FOR UPDATE");
                playerQuery.setString(1, sellId);
                playerQuery.setString(2, buyId);
                playerQuery.execute();

                PlayerBean sellPlayer = null;
                PlayerBean buyPlayer = null;

                ResultSet playerQueryResultSet = playerQuery.getResultSet();
                while (playerQueryResultSet.next()) {
                    PlayerBean player =  new PlayerBean(
                            playerQueryResultSet.getString("id"),
                            playerQueryResultSet.getInt("coins"),
                            playerQueryResultSet.getInt("goods")
                    );

                    System.out.println("\n[buyGoods]:\n    'check goods and coins enough'");
                    System.out.println(player);

                    if (sellId.equals(player.getId())) {
                        sellPlayer = player;
                    } else {
                        buyPlayer = player;
                    }
                }

                if (sellPlayer == null || buyPlayer == null) {
                    throw new SQLException("player not exist.");
                }

                if (sellPlayer.getGoods().compareTo(amount) < 0) {
                    throw new SQLException(String.format("sell player %s goods not enough.", sellId));
                }

                if (buyPlayer.getCoins().compareTo(price) < 0) {
                    throw new SQLException(String.format("buy player %s coins not enough.", buyId));
                }

                PreparedStatement transfer = connection.prepareStatement("UPDATE player set goods = goods + ?, coins = coins + ? WHERE id=?");
                transfer.setInt(1, -amount);
                transfer.setInt(2, price);
                transfer.setString(3, sellId);
                transfer.execute();
                effectPlayers += transfer.getUpdateCount();

                transfer.setInt(1, amount);
                transfer.setInt(2, -price);
                transfer.setString(3, buyId);
                transfer.execute();
                effectPlayers += transfer.getUpdateCount();

                connection.commit();

                System.out.println("\n[buyGoods]:\n    'trade success'");
            } catch (SQLException e) {
                System.out.printf("[buyGoods] ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());

                try {
                    System.out.println("[buyGoods] Rollback");

                    connection.rollback();
                } catch (SQLException ex) {
                    // do nothing
                }
            } finally {
                try {
                    connection.close();
                } catch (SQLException e) {
                    // do nothing
                }
            }

            return effectPlayers;
        }

        /**
         * Get the player info by id.
         *
         * @param id Player id.
         * @return The player of this id.
         */
        public PlayerBean getPlayer(String id) {
            PlayerBean player = null;

            try (Connection connection = ds.getConnection()) {
                PreparedStatement preparedStatement = connection.prepareStatement("SELECT * FROM player WHERE id = ?");
                preparedStatement.setString(1, id);
                preparedStatement.execute();

                ResultSet res = preparedStatement.executeQuery();
                if(!res.next()) {
                    System.out.printf("No players in the table with id %s", id);
                } else {
                    player = new PlayerBean(res.getString("id"), res.getInt("coins"), res.getInt("goods"));
                }
            } catch (SQLException e) {
                System.out.printf("PlayerDAO.getPlayer ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
            }

            return player;
        }

        /**
         * Insert randomized account data (id, coins, goods) using the JDBC fast path for
         * bulk inserts.  The fastest way to get data into TiDB is using the
         * TiDB Lightning(https://docs.pingcap.com/tidb/stable/tidb-lightning-overview).
         * However, if you must bulk insert from the application using INSERT SQL, the best
         * option is the method shown here. It will require the following:
         *
         *    Add `rewriteBatchedStatements=true` to your JDBC connection settings.
         *    Setting rewriteBatchedStatements to true now causes CallableStatements
         *    with batched arguments to be re-written in the form "CALL (...); CALL (...); ..."
         *    to send the batch in as few client/server round trips as possible.
         *    https://dev.mysql.com/doc/relnotes/connector-j/5.1/en/news-5-1-3.html
         *
         *    You can see the `rewriteBatchedStatements` param effect logic at
         *    implement function: `com.mysql.cj.jdbc.StatementImpl.executeBatchUsingMultiQueries`
         *
         * @param total Add players amount.
         * @param batchSize Bulk insert size for per batch.
         *
         * @return The number of new accounts inserted.
         */
        public int bulkInsertRandomPlayers(Integer total, Integer batchSize) {
            int totalNewPlayers = 0;

            try (Connection connection = ds.getConnection()) {
                // We're managing the commit lifecycle ourselves, so we can
                // control the size of our batch inserts.
                connection.setAutoCommit(false);

                // In this example we are adding 500 rows to the database,
                // but it could be any number.  What's important is that
                // the batch size is 128.
                try (PreparedStatement pstmt = connection.prepareStatement("INSERT INTO player (id, coins, goods) VALUES (?, ?, ?)")) {
                    for (int i=0; i<=(total/batchSize);i++) {
                        for (int j=0; j<batchSize; j++) {
                            String id = UUID.randomUUID().toString();
                            pstmt.setString(1, id);
                            pstmt.setInt(2, rand.nextInt(10000));
                            pstmt.setInt(3, rand.nextInt(10000));
                            pstmt.addBatch();
                        }

                        int[] count = pstmt.executeBatch();
                        totalNewPlayers += count.length;
                        System.out.printf("\nPlayerDAO.bulkInsertRandomPlayers:\n    '%s'\n", pstmt);
                        System.out.printf("    => %s row(s) updated in this batch\n", count.length);
                    }
                    connection.commit();
                } catch (SQLException e) {
                    System.out.printf("PlayerDAO.bulkInsertRandomPlayers ERROR: { state => %s, cause => %s, message => %s }\n",
                            e.getSQLState(), e.getCause(), e.getMessage());
                }
            } catch (SQLException e) {
                System.out.printf("PlayerDAO.bulkInsertRandomPlayers ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
            }
            return totalNewPlayers;
        }


        /**
         * Print a subset of players from the data store by limit.
         *
         * @param limit Print max size.
         */
        public void printPlayers(Integer limit) {
            try (Connection connection = ds.getConnection()) {
                PreparedStatement preparedStatement = connection.prepareStatement("SELECT * FROM player LIMIT ?");
                preparedStatement.setInt(1, limit);
                preparedStatement.execute();

                ResultSet res = preparedStatement.executeQuery();
                while (!res.next()) {
                    PlayerBean player = new PlayerBean(res.getString("id"),
                            res.getInt("coins"), res.getInt("goods"));
                    System.out.println("\n[printPlayers]:\n" + player);
                }
            } catch (SQLException e) {
                System.out.printf("PlayerDAO.printPlayers ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
            }
        }


        /**
         * Count players from the data store.
         *
         * @return All players count
         */
        public int countPlayers() {
            int count = 0;

            try (Connection connection = ds.getConnection()) {
                PreparedStatement preparedStatement = connection.prepareStatement("SELECT count(*) FROM player");
                preparedStatement.execute();

                ResultSet res = preparedStatement.executeQuery();
                if(res.next()) {
                    count = res.getInt(1);
                }
            } catch (SQLException e) {
                System.out.printf("PlayerDAO.countPlayers ERROR: { state => %s, cause => %s, message => %s }\n",
                        e.getSQLState(), e.getCause(), e.getMessage());
            }

            return count;
        }
    }

    public static void main(String[] args) {
        // 1. Configure the example database connection.

        // 1.1 Create a mysql data source instance.
        MysqlDataSource mysqlDataSource = new MysqlDataSource();

        // 1.2 Set server name, port, database name, username and password.
        mysqlDataSource.setServerName("localhost");
        mysqlDataSource.setPortNumber(4000);
        mysqlDataSource.setDatabaseName("test");
        mysqlDataSource.setUser("root");
        mysqlDataSource.setPassword("");

        // Or you can use jdbc string instead.
        // mysqlDataSource.setURL("jdbc:mysql://{host}:{port}/test?user={user}&password={password}");

        // 2. And then, create DAO to manager your data.
        PlayerDAO dao = new PlayerDAO(mysqlDataSource);

        // 3. Run some simple examples.

        // Create a player, who has a coin and a goods..
        dao.createPlayers(Collections.singletonList(new PlayerBean("test", 1, 1)));

        // Get a player.
        PlayerBean testPlayer = dao.getPlayer("test");
        System.out.printf("PlayerDAO.getPlayer:\n    => id: %s\n    => coins: %s\n    => goods: %s\n",
                testPlayer.getId(), testPlayer.getCoins(), testPlayer.getGoods());

        // Create players with bulk inserts. Insert 1919 players totally, with 114 players per batch.
        int addedCount = dao.bulkInsertRandomPlayers(1919, 114);
        System.out.printf("PlayerDAO.bulkInsertRandomPlayers:\n    => %d total inserted players\n", addedCount);

        // Count players amount.
        int count = dao.countPlayers();
        System.out.printf("PlayerDAO.countPlayers:\n    => %d total players\n", count);

        // Print 3 players.
        dao.printPlayers(3);

        // 4. Explore more.

        // Player 1: id is "1", has only 100 coins.
        // Player 2: id is "2", has 114514 coins, and 20 goods.
        PlayerBean player1 = new PlayerBean("1", 100, 0);
        PlayerBean player2 = new PlayerBean("2", 114514, 20);

        // Create two players "by hand", using the INSERT statement on the backend.
        addedCount = dao.createPlayers(Arrays.asList(player1, player2));
        System.out.printf("PlayerDAO.createPlayers:\n    => %d total inserted players\n", addedCount);

        // Player 1 wants to buy 10 goods from player 2.
        // It will cost 500 coins, but player 1 cannot afford it.
        System.out.println("\nPlayerDAO.buyGoods:\n    => this trade will fail");
        int updatedCount = dao.buyGoods(player2.getId(), player1.getId(), 10, 500);
        System.out.printf("PlayerDAO.buyGoods:\n    => %d total update players\n", updatedCount);

        // So player 1 has to reduce the incoming quantity to two.
        System.out.println("\nPlayerDAO.buyGoods:\n    => this trade will success");
        updatedCount = dao.buyGoods(player2.getId(), player1.getId(), 2, 100);
        System.out.printf("PlayerDAO.buyGoods:\n    => %d total update players\n", updatedCount);
    }
}
```


## 第 3 步：运行代码

本节将逐步介绍代码的运行方法。

### 第 3 步第 1 部分：JDBC 表初始化

- 使用 JDBC
- 使用 Mybatis（推荐）
- 使用 Hibernate（推荐）

> 在 Gitpod Playground 中尝试 JDBC: [现在就试试](https://gitpod.io/#targetMode=plain-java-jdbc/https://github.com/pingcap-inc/tidb-example-java)

使用 JDBC 时，需手动初始化数据库表，若你本地已经安装了 `mysql-client`，且使用本地集群，可直接在 `plain-java-jdbc` 目录下运行：

```
make mysql
```

或直接执行：

```
mysql --host 127.0.0.1 --port 4000 -u root<src/main/resources/dbinit.sql
```

若你不使用本地集群，或未安装 **mysql-client**，请直接登录你的集群，并运行 `src/main/resources/dbinit.sql` 文件内的 SQL 语句。



### [第 3 步第 2 部分：TiDB Cloud 更改参数](https://tidb.net/blog/2e652000#第 3 步：运行代码  /第 3 步第 2 部分：TiDB Cloud 更改参数 )[](https://tidb.net/blog/2e652000#第-3-步第-2-部分tidb-cloud-更改参数)

- 使用 JDBC
- 使用 Mybatis（推荐）
- 使用 Hibernate（推荐）

若你使用非本地默认集群、TiDB Cloud 或其他远程集群，更改 `JDBCExample.java` 内关于 Host、Port、User、Password 的参数：

```
mysqlDataSource.setServerName("localhost");
mysqlDataSource.setPortNumber(4000);
mysqlDataSource.setDatabaseName("test");
mysqlDataSource.setUser("root");
mysqlDataSource.setPassword("");
```

若你设定的密码为 `123456`，而且从 TiDB Cloud 得到的连接字符串为：

```
mysql --connect-timeout 15 -u root -h xxx.tidbcloud.com -P 4000 -p
```

那么此处应将参数更改为：

```
mysqlDataSource.setServerName("xxx.tidbcloud.com");
mysqlDataSource.setPortNumber(4000);
mysqlDataSource.setDatabaseName("test");
mysqlDataSource.setUser("root");
mysqlDataSource.setPassword("123456");
```



### 第 3 步第 3 部分：运行

- 使用 JDBC
- 使用 Mybatis（推荐）
- 使用 Hibernate（推荐）

运行 `make`，这是以下两个操作的组合：

- 清理并构建 (make build)： `mvn clean package`
- 运行 (make run)： `java -jar target/plain-java-jdbc-0.0.1-jar-with-dependencies.jar`

你也可以单独运行这两个 make 命令或原生命令。

## 第 4 步：预期输出

- 使用 JDBC
- 使用 Hibernate（推荐）

[JDBC 预期输出](https://github.com/pingcap-inc/tidb-example-java/blob/main/Expected-Output.md#plain-java-jdbc)