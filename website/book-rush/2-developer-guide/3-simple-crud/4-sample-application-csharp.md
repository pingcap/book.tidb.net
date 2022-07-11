---
title: TiDB 和 C# 的简单 CRUD 应用程序
hide_title: true
---

# TiDB 和 C# 的简单 CRUD 应用程序

> 作者：[hey-hoho](https://asktug.com/u/hey-hoho/summary)，不知名 CRUD 程序员，TiDB 社区技术布道师、版主，分布式技术爱好者。

本文演示如何使用 C# 语言实现对 TiDB 的基础增删改查操作，包含了 C# 中常用的几种数据库访问方式。

>  相关环境
>
>  - Ubuntu 18.04
>  - .NET 6.0
>  - C# 10
>  - Visual Studio Code 1.63.2
>  - TiDB 6.0-DMR

##  创建 TiDB 测试集群

你可以使用以下方式快速搭建一个 TiDB 测试集群：

- [使用 TiDB Cloud 免费创建在线集群](https://docs.pingcap.com/zh/tidb/stable/dev-guide-build-cluster-in-cloud)
- [使用 TiUP 部署本地测试集群](https://docs.pingcap.com/zh/tidb/stable/quick-start-with-tidb)
- [使用 TiUP 部署标准 TiDB 集群](https://docs.pingcap.com/zh/tidb/stable/production-deployment-using-tiup)
- [使用 TiDB Operator 在 Kubernetes 中部署 TiDB 集群](https://docs.pingcap.com/zh/tidb-in-kubernetes/stable/get-started)

本文仅用于代码演示，在单机环境使用 TiUP Playground 搭建了一套最基础的测试集群：

```bash
[root@dbserver1 ~]# tiup playground v6.0.0 --db 1 --pd 1 --kv 3 --tag tidb
tiup is checking updates for component playground ...timeout!
Starting component `playground`: /root/.tiup/components/playground/v1.9.5/tiup-playground /root/.tiup/components/playground/v1.9.5/tiup-playground v6.0.0 --db 1 --pd 1 --kv 3 --tag tidb
Playground Bootstrapping...
Start pd instance:v6.0.0
Start tikv instance:v6.0.0
Start tikv instance:v6.0.0
Start tikv instance:v6.0.0
Start tidb instance:v6.0.0
Waiting for tidb instances ready
127.0.0.1:4000 ... Done
Start tiflash instance:v6.0.0
Waiting for tiflash instances ready
127.0.0.1:3930 ... Done
CLUSTER START SUCCESSFULLY, Enjoy it ^-^
To connect TiDB: mysql --comments --host 127.0.0.1 --port 4000 -u root -p (no password)
To view the dashboard: http://127.0.0.1:2379/dashboard
PD client endpoints: [127.0.0.1:2379]
To view the Prometheus: http://127.0.0.1:9090
To view the Grafana: http://127.0.0.1:3000
```

数据库启动成功之后，我们用官方提供的 [Bookshop](https://docs.pingcap.com/zh/tidb/stable/dev-guide-bookshop-schema-design) 示例应用作为测试数据，使用如下命令生成数据：

```bash
tiup demo bookshop prepare --users=1000 --books=5000 --authors=1000 --ratings=10000 --orders=2000 --drop-tables
```

最后看一下测试数据的生成情况：

```sql
+-----------------------+----------------+-----------+------------+--------+
| Table Name            | Number of Rows | Data Size | Index Size | Total  |
+-----------------------+----------------+-----------+------------+--------+
| bookshop.orders       |           2000 | 0.08MB    | 0.02MB     | 0.09MB |
| bookshop.ratings      |          10000 | 0.31MB    | 0.31MB     | 0.61MB |
| bookshop.book_authors |           5000 | 0.08MB    | 0.08MB     | 0.15MB |
| bookshop.authors      |           1000 | 0.04MB    | 0.00MB     | 0.04MB |
| bookshop.users        |            999 | 0.03MB    | 0.01MB     | 0.04MB |
| bookshop.books        |           5000 | 0.28MB    | 0.00MB     | 0.28MB |
+-----------------------+----------------+-----------+------------+--------+
6 rows in set (0.01 sec)
```

## 创建 C# 应用程序

为了简化演示代码，这里构建一个最简单的控制台应用程序用于数据库访问。

```bash
dotnet new console --name tidb-example-csharp --framework net6.0
```

看一下这个控制台程序的项目结构：

```bash
dc@dc-virtual-machine:~/dotnet$ ll tidb-example-csharp/
total 20
drwxrwxr-x 3 dc dc 4096 May 17 16:43 ./
drwxrwxr-x 3 dc dc 4096 May 17 16:43 ../
drwxrwxr-x 2 dc dc 4096 May 17 16:43 obj/
-rw-rw-r-- 1 dc dc  105 May 17 16:43 Program.cs
-rw-rw-r-- 1 dc dc  305 May 17 16:43 tidb-example-csharp.csproj
```

`tidb-example-csharp.csproj`是项目工程文件，`Program.cs`是程序入口文件。

验证一下程序是否能正常运行：

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
Hello, World!
```

## 驱动程序和 ORM

ADO.NET 提供了开发者在 .NET 平台上对各种数据源的一致性访问标准，类似于 Java 的 jdbc，或者 Golang 的 sql/database 。在此基础上，我们通过实现了 ADO.NET 接口的驱动程序就能访问和操作不同的数据库，包括 SQL Server、PostgreSQL、MySQL、Oracle、Sqlite、Access 等等。

ADO.NET 体系结构（图片来自微软官网）：

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/ado-1-bpuedev11-1653317474073.png)

TiDB 高度兼容 MySQL 5.7 协议，还实现了一部分 MySQL 8.0 特性，所以市面上 MySQL 能使用的驱动程序和 ORM 框架基本都能用在 TiDB 上面。

梳理一下可以发现，在 C# 中实现对 TiDB 的操作分为以下两种方式：

- 基于 ADO.NET 的驱动程序，代表有`Oracle  Connector/NET`、`MySqlConnector`。
- ORM 数据访问框架，代表有`Entity Framework`、`Dapper`。

下面分别演示如何对 TiDB 实现增删改查操作。

### 使用 Oracle  Connector/NET

[Connector/NET](https://github.com/mysql/mysql-connector-net) 是 MySQL 官方提供的符合标准 ADO.NET 体系的数据库访问驱动，由于 TiDB 高度兼容 MySQL 协议，所以市面上 MySQL 能使用的驱动基本都能用在 TiDB 上面。



如果要以 ADO.NET 接口方式访问 TiDB ，首先安装驱动程序包：

```bash
dotnet add package MySql.Data --version 8.0.29
```

测试是否能连接上 TiDB ：

```c#
using MySql.Data.MySqlClient;
        
const string conectionStr = "Server=127.0.0.1;UserId=root;Password=;Port=4000;Database=bookshop";

public void TestConnection()
{
     MySqlConnection conn = new MySqlConnection(conectionStr);
     conn.Open();
     var cmd = conn.CreateCommand();
     cmd.CommandText = "select tidb_version()";
     var result = cmd.ExecuteScalar();
     Console.WriteLine(result);
     conn.Close();
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
Release Version: v6.0.0
Edition: Community
Git Commit Hash: 36a9810441ca0e496cbd22064af274b3be771081
Git Branch: heads/refs/tags/v6.0.0
UTC Build Time: 2022-03-31 10:33:28
GoVersion: go1.18
Race Enabled: false
TiKV Min Version: v3.0.0-60965b006877ca7234adaced7890d7b029ed1306
Check Table Before Drop: false
```

一个简单的查询示例：

```c#
public void TestRead()
{
    MySqlConnection conn = new MySqlConnection(conectionStr);
    conn.Open();
    var cmd = conn.CreateCommand();
    cmd.CommandText = "select * from books limit 5";
     MySqlDataReader reader = cmd.ExecuteReader();
    while (reader.Read())
    {
        Console.WriteLine($"id: {reader["id"]}  title: {reader["title"]}  type: {reader["type"]} published_at: {reader["published_at"]}");
    }
   conn.Close();
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
id: 648872  title: Sam Mayert  type: Life published_at: 2/26/1953 12:53:33 PM
id: 6583703  title: Aron Kilback  type: Kids published_at: 11/23/1923 9:19:43 AM
id: 6810515  title: Chelsey Dickens  type: Education & Reference published_at: 4/8/1985 9:23:37 PM
id: 7884508  title: Annetta Rodriguez  type: Education & Reference published_at: 5/11/1962 9:54:58 PM
id: 8683541  title: The Documentary of hamster  type: Magazine published_at: 10/3/1945 1:44:52 AM
```

一个简单的新增修改删除示例：

```c#
public void TestWrite()
{
    MySqlConnection conn = new MySqlConnection(conectionStr);
    conn.Open();

    int bookId = 888888;

    var cmd1 = new MySqlCommand("insert into books values (@id,@title,@type,@published_at,@stock,@price)", conn);
    cmd1.Parameters.AddWithValue("@id", bookId);
    cmd1.Parameters.AddWithValue("@title", "TiDB in action");
    cmd1.Parameters.AddWithValue("@type", "Science & Technology");
    cmd1.Parameters.AddWithValue("@published_at", DateTime.Now);
    cmd1.Parameters.AddWithValue("@stock", 1000);
    cmd1.Parameters.AddWithValue("@price", 66.66);
    int insertCnt = cmd1.ExecuteNonQuery();
    Console.WriteLine($"insert successed {insertCnt} books.");
    TestQueryBook(conn, bookId);

    var cmd2 = new MySqlCommand("update books set stock=stock-1 where id=@id", conn);
    cmd2.Parameters.AddWithValue("@id", bookId);
    int updateCnt = cmd2.ExecuteNonQuery();
    Console.WriteLine($"update successed {updateCnt} books.");
    TestQueryBook(conn, bookId);

    var cmd3 = new MySqlCommand("delete from books where id=@id", conn);
    cmd3.Parameters.AddWithValue("@id", bookId);
    int deleteCnt = cmd3.ExecuteNonQuery();
    Console.WriteLine($"delete successed {updateCnt} books.");
    TestQueryBook(conn, bookId);

    conn.Close();
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
insert successed 1 books.
id: 888888  title: TiDB in action  type: Science & Technology published_at: 5/18/2022 3:22:02 PM stock: 1000 price: 66.66
update successed 1 books.
id: 888888  title: TiDB in action  type: Science & Technology published_at: 5/18/2022 3:22:02 PM stock: 999 price: 66.66
delete successed 1 books.
book id 888888 not found.
```

更多 API 用法可以参考官方文档：

> https://dev.mysql.com/doc/connector-net/en/connector-net-programming.html
>
> https://dev.mysql.com/doc/connector-net/en/connector-net-tutorials.html`
>
> 注意：对于这种数据库 IO 类型请求，建议使用 API 的异步同名方法提高程序处理效率，例如`ExecuteNonQueryAsync`。

这里梳理一下连接字符串中的核心参数。

| 参数名                                                       | 描述                                             | 默认值    |
| :----------------------------------------------------------- | ------------------------------------------------ | --------- |
| **`Server` ,** **`Host` ,** **`Data Source` ,** **`DataSource`** | 数据库连接主机                                   | localhost |
| **`Port`**                                                   | 数据库连接端口                                   | 3306      |
| **`UserID` ,** **`User Id` ,** **`Username` ,** **`Uid` ,** **`User name` ,** **`User`** | 数据库登录用户名                                 | null      |
| **`Password`** , **`pwd` **                                  | 数据库登录用户密码                               |           |
| **`ConnectionTimeout` ,** **`Connect Timeout` ,** **`Connection Timeout`** | 数据量连接超时时间                               | 15s       |
| **`DefaultCommandTimeout` ,** **`Default Command Timeout`**  | SQL  执行的超时时间                              | 30s       |
| **`Pooling`**                                                | 是否启用连接池                                   | true      |
| **`ConnectionLifeTime` ,** **`Connection Lifetime`**         | 连接过期时间，超过这个时间的连接会被销毁重新创建 | 0(不限制) |
| **`MaxPoolSize`**, **`Max Pool Size`**                       | 连接池最大连接数                                 | 100       |
| **`MinPoolSize`**, **`Min Pool Size`**                       | 连接池最小连接数                                 | 0         |
| **`TableCaching` ,** **`Table Cache` ,** **`TableCache`**    | 是否开启客户端表数据缓存                         | false     |
| **`DefaultTableCacheAge` ,** **`Default Table Cache Age`**   | 客户端表数据缓存时间                             | 60s       |
| **`AllowBatch` ,** **`Allow Batch`**                         | 是否允许批量 SQL 执行                            | true      |

关于连接池参数的最佳实践可以参考[TiDB官网文档](https://docs.pingcap.com/zh/tidb/stable/dev-guide-connection-parameters#%E8%BF%9E%E6%8E%A5%E6%B1%A0%E5%8F%82%E6%95%B0)。

### 使用 MySqlConnector

[MySqlConnector](https://github.com/mysql-net/MySqlConnector/) 也是广泛使用的一种实现了 ADO.NET 接口的 MySQL 驱动，它提供了比`MySql.Data`更好的异步性能，很多 ORM 框架底层都是依赖于MySqlConnector 实现对 MySQL 的访问。

首先在项目中安装依赖包：

```bash
dotnet add package MySqlConnector --version 2.1.9
```

看一个数据库连接示例：

```c#
using MySqlConnector;

const string conectionStr = "Server=127.0.0.1;UserId=root;Password=;Port=4000;Database=bookshop";

public async Task TestConnection()
{
    using (var conn = new MySqlConnection(conectionStr))
    {
        await  conn.OpenAsync();
        using (var cmd = new MySqlCommand("select tidb_version()", conn))
        {
            var result = await cmd.ExecuteScalarAsync();
            Console.WriteLine(result);
        }
    }
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
Release Version: v6.0.0
Edition: Community
Git Commit Hash: 36a9810441ca0e496cbd22064af274b3be771081
Git Branch: heads/refs/tags/v6.0.0
UTC Build Time: 2022-03-31 10:33:28
GoVersion: go1.18
Race Enabled: false
TiKV Min Version: v3.0.0-60965b006877ca7234adaced7890d7b029ed1306
Check Table Before Drop: false
```

可以看到使用方式和`Connector/NET`非常相似都是标准的 ADO.NET 风格，`MySqlConnector`的连接字符串参数绝大部分都兼容

`Connector/NET`，并且在此基础上提供了一些新的特性，比如负载均衡功能：

| 参数名                                                       | 说明                                                         | 默认值     |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ---------- |
| **`Server, Host`**, **`Data Source`**, **`DataSource`**, **`Address`**, **`Addr`**, **`Network Address`** | 数据库请求地址，可以用逗号分隔填写多个地址实现负载均衡       | localhost  |
| **`Load Balance`**, **`LoadBalance`**                        | 负载均衡策略，支持 RoundRobin、LeastConnections、Failover 三种模式，需要开启连接池 | RoundRobin |

> 【注意】
>
> 有些参数在`MySqlConnector`已经禁用了，更多差异和新增功能参考官网文档：https://mysqlconnector.net/connection-options/

除了可以使用连接字符串，`MySqlConnector`还支持 Builder 对象模式，连接串里的参数都能在`MySqlConnectionStringBuilder`找到对应的字段，例如：

```c#
var builder = new MySqlConnectionStringBuilder
{
	Server = "your-server",
	UserID = "database-user",
	Password = "P@ssw0rd!",
	Database = "database-name",
};

// open a connection asynchronously
using var connection = new MySqlConnection(builder.ConnectionString);
await connection.OpenAsync();
```

一个简单的查询示例：

```c#
public async Task TestRead()
{
    using (var conn = new MySqlConnection(conectionStr))
    {
        await conn.OpenAsync();

        var cmd = conn.CreateCommand();
        cmd.CommandText = "select * from users limit 5;";
        MySqlDataReader reader =await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            Console.WriteLine($"id: {reader.GetInt32("id")}  balance: {reader.GetDecimal("balance")}  nicknmame: {reader.GetString("nickname")} ");
        }
    }
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
id: 525196  balance: 9490.89  nicknmame: Goodwin4601
id: 822804  balance: 1197.81  nicknmame: Treutel4269
id: 4147652  balance: 349.36  nicknmame: Pacocha6285
id: 9704562  balance: 2292.28  nicknmame: Grady8130
id: 17101775  balance: 5054.69  nicknmame: Macejkovic7559
```

一个简单的增删改示例：

```c#
public async Task TestWrite()
{
    using (var conn = new MySqlConnection(conectionStr))
    {
        await conn.OpenAsync();

        int userId = 888888;

        var cmd1 = new MySqlCommand("insert into users values (@id,@balance,@nickname)", conn);
        cmd1.Parameters.AddWithValue("@id", userId);
        cmd1.Parameters.AddWithValue("@balance", 0.01);
        cmd1.Parameters.AddWithValue("@nickname", "hey-hoho");
        int insertCnt = await cmd1.ExecuteNonQueryAsync();
        Console.WriteLine($"insert successed {insertCnt} users.");
        TestQueryUser(conn, userId);

        var cmd2 = new MySqlCommand("update users set balance=balance+99 where id=@id", conn);
        cmd2.Parameters.AddWithValue("@id", userId);
        int updateCnt =await cmd2.ExecuteNonQueryAsync();
        Console.WriteLine($"update successed {updateCnt} users.");
        TestQueryUser(conn, userId);

        var cmd3 = new MySqlCommand("delete from users where id=@id", conn);
        cmd3.Parameters.AddWithValue("@id", userId);
        int deleteCnt = await cmd3.ExecuteNonQueryAsync();
        Console.WriteLine($"delete successed {updateCnt} users.");
        TestQueryUser(conn, userId);

    }
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
insert successed 1 users.
id: 888888  balance: 0.01  nicknmame: hey-hoho
update successed 1 users.
id: 888888  balance: 99.01  nicknmame: hey-hoho
delete successed 1 users.
user id 888888 not found.
```

一个简单的事务使用示例：

```c#
public async Task TestTransaction()
{
    // 用一个事务演示购书流程
    using (var conn = new MySqlConnection(conectionStr))
    {
        await conn.OpenAsync();

        int userId = 525196, bookId = 648872;
        decimal price = 15;

        var tnx = await conn.BeginTransactionAsync();

        try
        {
            // 新增一个订单
            var cmd1 = new MySqlCommand("insert into orders values(@id, @book_id, @user_id, @quality, @ordered_at)", conn, tnx);
            cmd1.Parameters.AddWithValue("@id", 999999);
            cmd1.Parameters.AddWithValue("@book_id", bookId);
            cmd1.Parameters.AddWithValue("@user_id", userId);
            cmd1.Parameters.AddWithValue("@quality", 1);
            cmd1.Parameters.AddWithValue("@ordered_at", DateTime.Now);
            await cmd1.ExecuteNonQueryAsync();

            // 扣减账户余额
            var cmd2 = new MySqlCommand("update users set balance=balance-@price where id =@id", conn, tnx);
            cmd2.Parameters.AddWithValue("@id", userId);
            cmd2.Parameters.AddWithValue("@price", price);
            await cmd2.ExecuteNonQueryAsync();

            // 更新商品库存
            var cmd3 = new MySqlCommand("update books set stock=stock-1 where id =@id", conn, tnx);
            cmd3.Parameters.AddWithValue("@id", bookId);
            await cmd3.ExecuteNonQueryAsync();

            // 提交事务
            await tnx.CommitAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex.ToString());
            // 异常回滚事务
            await tnx.RollbackAsync();
        }
    }
}
```

需要注意的是，**如果有大量重复的 SQL 需要执行，建议使用 TiDB 的 Prepare Statement 特性**，它能有效减少 SQL 编译解析的时间提升执行效率，使用示例：

```c#
cmd.CommandText = "insert into books values (@id, @title, @type, @published_at, @stock, @price)";
cmd.Parameters.Add("@id", MySqlDbType.Int32);
cmd.Parameters.Add("@title", MySqlDbType.String);
...
cmd.Prepare();

for (int i = 1; i <= 1000; i++)
{
    cmd.Parameters["@id"].Value = i;
    cmd.Parameters["@title"].Value = $"TiDB in action - {i}";
    ...
    await cmd.ExecuteNonQueryAsync();
}
```

![](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/%E4%BC%81%E4%B8%9A%E5%BE%AE%E4%BF%A1%E6%88%AA%E5%9B%BE_20220519171121-1653317790597.png)

更多用法可以参考官网文档：https://mysqlconnector.net/

### 使用 Entity Framework

Entity Framework (EF) 是 .NET 领域最知名的跨平台数据库访问 ORM 框架，它最早在 2008 年作为 .NET Framework 的一部分发布，现在的最新版本是 EF Core 6.0，也已经[开源](https://github.com/dotnet/efcore)。

它支持丰富的数据访问驱动，基于这个特性我们可以使用一套统一的 API 接口访问各种类型的数据库，比如 Sqlite、SQL Server、MySQL、PostgreSQL、Spanner 等等。在 MySQL 协议上，广泛使用的驱动有两个：

- [Pomelo.EntityFrameworkCore.MySql](https://github.com/PomeloFoundation/Pomelo.EntityFrameworkCore.MySql)
- [MySql.EntityFrameworkCore](https://www.nuget.org/packages/MySql.EntityFrameworkCore)

在使用之前先安装 Entity Framework 的基础包：

```c#
dotnet add package Microsoft.EntityFrameworkCore --version 6.0.5
dotnet add package Microsoft.Extensions.Logging.Console //记录日志用，非必须
```

#### Pomelo.EntityFrameworkCore.MySql

`Pomelo.EntityFrameworkCore.MySql`是最流行的兼容 MySQL 协议的 EF Core 驱动，也是微软官方推荐使用的方式，它底层依赖于前面提到的`MySqlConnector`，所以在连接串配置上并无差别。

```c#
dotnet add package Pomelo.EntityFrameworkCore.MySql --version 6.0.1
```

先构造一个`DbContext`类型和对应的实体类：

```c#
using Microsoft.EntityFrameworkCore;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using Pomelo.EntityFrameworkCore.MySql;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.Extensions.Logging;

public class BookShopContext : DbContext
    {
        const string conectionStr = "Server=127.0.0.1;UserId=root;Password=;Port=4000;Database=bookshop";

        public DbSet<User> Users { get; set; }
        public DbSet<Book> Books { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder options)
        {
            options.UseMySql(conectionStr, ServerVersion.Create(new Version("5.7.25"), ServerType.MySql));

            options.UseLoggerFactory(LoggerFactory.Create(builder =>
            {
                builder.AddConsole();
            }));
        }
    }

    public class User
    {
        [Column("id")]
        public long Id { get; set; }
        [Column("balance")]
        public decimal Balance { get; set; }
        [Column("nickname")]
        public string Nickname { get; set; }
    }

    public class Book
    {
        [Column("id")]
        public long Id { get; set; }
        [Column("title")]
        public string Title { get; set; }
        [Column("type")]
        public string Type { get; set; }
        [Column("published_at")]
        public DateTime PublishedAt { get; set; }
        [Column("stock")]
        public int Stock { get; set; }
        [Column("price")]
        public decimal Price { get; set; }
    }
```

验证是否能连接上 TiDB ：

```c#
public async Task TestConnection()
{
    using var context = new BookShopContext();
    Console.WriteLine($"TiDB CanConnect: {await context.Database.CanConnectAsync()}");
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
TiDB CanConnect: True
```

一个单表分页查询结果集的示例：

```c#
public async Task TestRead()
{
    using var context = new BookShopContext();

    var books = await context.Books.Where(b => b.Title.Contains("db")).OrderBy(b => b.Id).Skip(2).Take(5).ToListAsync();
    foreach (var book in books)
    {
        Console.WriteLine($"id: {book.Id}  title: {book.Title}  type: {book.Type} published_at: {book.PublishedAt}");
    }
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
info: Microsoft.EntityFrameworkCore.Infrastructure[10403]
      Entity Framework Core 6.0.5 initialized 'BookShopContext' using provider 'Pomelo.EntityFrameworkCore.MySql:6.0.1' with options: ServerVersion 5.7.25-mysql
info: Microsoft.EntityFrameworkCore.Database.Command[20101]
      Executed DbCommand (47ms) [Parameters=[@__p_1='?' (DbType = Int32), @__p_0='?' (DbType = Int32)], CommandType='Text', CommandTimeout='30']
      SELECT `b`.`id`, `b`.`price`, `b`.`published_at`, `b`.`stock`, `b`.`title`, `b`.`type`
      FROM `Books` AS `b`
      WHERE `b`.`title` LIKE '%db%'
      ORDER BY `b`.`id`
      LIMIT @__p_1 OFFSET @__p_0
id: 474329852  title: Geovany Padberg  type: Science & Technology published_at: 2010/1/28 6:45:33
id: 1890134379  title: The Adventures of Hilda Padberg  type: Comics published_at: 1943/7/17 16:28:02
id: 2181887016  title: Catalina Padberg  type: Education & Reference published_at: 1961/3/28 18:18:37
id: 2193223665  title: Caroline Padberg  type: Kids published_at: 1994/11/12 20:56:53
id: 2359817065  title: Darryl Padberg  type: Science & Technology published_at: 1940/11/13 9:53:21
```

一个简单的增删改示例：

```c#
public async Task TestWrite()
{
    using var context = new BookShopContext();

    long userId = 888888;

    var user = new User
    {
        Id = userId,
        Balance = 0.01M,
        Nickname = "hey-hoho"
    };
    context.Add(user);
    int insertCnt = await context.SaveChangesAsync();
    Console.WriteLine($"insert successed {insertCnt} users.");
    TestQueryUser(context, userId);

    user.Balance += 99;
    int updateCnt = await context.SaveChangesAsync();
    Console.WriteLine($"update successed {updateCnt} users.");
    TestQueryUser(context, userId);

    context.Remove(user);
    int deleteCnt = await context.SaveChangesAsync();
    Console.WriteLine($"delete successed {deleteCnt} users.");
    TestQueryUser(context, userId);
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
insert successed 1 users.
id: 888888  balance: 0.01  nicknmame: hey-hoho
update successed 1 users.
id: 888888  balance: 99.01  nicknmame: hey-hoho
delete successed 1 users.
user id 888888 not found.
```

> 【注意】
>
> 当只需要查询结果而不用对结果进行修改时，建议关闭 EF Core 的`tracking`功能，它能提高执行速度。比如：
>
> ```c#
> // 单个查询关闭跟踪
> var books = await context.Books.OrderBy(b => b.Id).Take(3).AsNoTracking().ToListAsync();
> // 整个上下文关闭跟踪
> options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
> ```

`Pomelo.EntityFrameworkCore.MySql`的文档地址：

> https://github.com/PomeloFoundation/Pomelo.EntityFrameworkCore.MySql/wiki

#### MySql.EntityFrameworkCore

`MySql.EntityFrameworkCore`是 Oracle 官方发布的`Entity Framework`支持 MySQL 的数据库驱动，所以它的底层是依赖于`Connector/NET`。

如果你想使用`Connector/NET 8.0.28 `及以后的版本，那么安装这个包：

```c#
dotnet add package MySql.EntityFrameworkCore --version 6.0.1 //版本对应.NET的版本
```

如果你使用的是`Connector/NET`早期版本，那么安装这个包：

```c#
dotnet add package MySql.Data.EntityFrameworkCore --version 8.0.22
```

在使用方式上只有配置连接串上的一点点差别：

```c#
protected override void OnConfiguring(DbContextOptionsBuilder options)
{
    options.UseMySQL("server=localhost;database=library;user=user;password=password");
}
```

其他数据库操作都是用标准的 EF API。

`MySql.EntityFrameworkCore`的文档地址：

>https://dev.mysql.com/doc/connector-net/en/connector-net-entity-framework.html

总体来说，使用`Entity Framework`操作 TiDB 并没有什么特殊的地方，有使用经验的开发者几乎不用任何学习成本就能快速上手。

`Entity Framework`更多用法可以参考官网文档：https://docs.microsoft.com/en-us/ef/core/

### 使用Dapper

`Dapper`是 StackExchange 开源的一款轻量级 ORM 框架，它以高性能著称，在 .NET 领域使用非常广泛。它扩展了 ADO.NET 的`IDbConnection`接口，底层同样依赖于`MySqlConnector`或者`Connector/NET`，使用方式介于原生 ADO.NET 和 Entity Framework 之间。

```c#
dotnet add package Dapper.StrongName --version 2.0.123
```

测试数据库连接：

```c#
using Dapper;
using MySqlConnector;

const string conectionStr = "Server=127.0.0.1;UserId=root;Password=;Port=4000;Database=bookshop";

public async Task TestConnection()
{
    MySqlConnection conn = new MySqlConnection(conectionStr);
    var version =await  conn.ExecuteScalarAsync<string>("select tidb_version()");
    Console.WriteLine(version);
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
Release Version: v6.0.0
Edition: Community
Git Commit Hash: 36a9810441ca0e496cbd22064af274b3be771081
Git Branch: heads/refs/tags/v6.0.0
UTC Build Time: 2022-03-31 10:33:28
GoVersion: go1.18
Race Enabled: false
TiKV Min Version: v3.0.0-60965b006877ca7234adaced7890d7b029ed1306
Check Table Before Drop: false
```

使用强类型的查询示例：

```c#
public class Book
{
    public long Id { get; set; }
    public string Title { get; set; }
    public string Type { get; set; }
    public DateTime Published_At { get; set; }
    public int Stock { get; set; }
    public decimal Price { get; set; }
}

public async Task TestQuery()
{
    MySqlConnection conn = new MySqlConnection(conectionStr);

    var book = await conn.QueryFirstAsync<Book>("select * from books where id = @id", new { id = 8683541 });
    Console.WriteLine($"id: {book.Id}  title: {book.Title}  type: {book.Type} published_at: {book.Published_At} stock: {book.Stock} price: {book.Price}");

    var books = await conn.QueryAsync<Book>("select * from books where type = @type and stock < @stock order by published_at limit 3", new { type = "Sports" stock = 100 });
    books.ToList().ForEach(b =>
       Console.WriteLine($"id: {b.Id}  title: {b.Title}  type: {b.Type} published_at: {b.Published_At} stock: {b.Stock} price: {b.Price}")
    );
}
```

```bash
dc@dc-virtual-machine:~/dotnet/tidb-example-csharp$ dotnet run
id: 8683541  title: The Documentary of hamster  type: Magazine published_at: 1945/10/3 1:44:52 stock: 190 price: 74.38

id: 1201887882  title: Nayeli Luettgen  type: Sports published_at: 1901/11/20 19:37:37 stock: 53 price: 141.50
id: 3705800883  title: Arianna Considine  type: Sports published_at: 1905/8/31 5:25:53 stock: 72 price: 312.93
id: 1811359739  title: Dawson Hackett  type: Sports published_at: 1910/12/1 21:22:47 stock: 72 price: 415.72
```

带事务的增删改示例：

```c#
public class Order
{
    public long Id { get; set; }
    public long Book_Id { get; set; }
    public long User_Id { get; set; }
    public int Quality { get; set; }
    public DateTime Ordered_At { get; set; }
}
// 用一个事务演示购书流程
public async Task TestTransaction()
{
    MySqlConnection conn = new MySqlConnection(conectionStr);

    int userId = 525196, bookId = 648872;
    decimal price = 15;

    await conn.OpenAsync();
    var tnx = await conn.BeginTransactionAsync();

    try
    {
        // 新增一个订单
        var order = new Order
        {
            Id = 666666,
            Book_Id = bookId,
            User_Id = userId,
            Quality = 1,
            Ordered_At = DateTime.Now
        };
        await conn.ExecuteAsync("insert into orders values(@id, @book_id, @user_id, @quality, @ordered_at)", order, tnx);

        // 更新账户余额
        await conn.ExecuteAsync("update users set balance=balance-@price where id =@id", new { id = userId, price = price }, tnx);

        // 更新商品库存
        await conn.ExecuteAsync("update books set stock=stock-1 where id =@id", new { id = bookId }, tnx);

        // 提交事务
        await tnx.CommitAsync();
    }
    catch (Exception ex)
    {
        Console.WriteLine(ex.ToString());
        // 异常回滚事务
        await tnx.RollbackAsync();
    }
}
```

> `Dapper`一般情况下会自动管理连接的开启关闭状态，使用起来比原生ADO.NET更加方便。但是要注意的是，在使用显式事务的时候要提前手动打开连接，否则会报异常`System.InvalidOperationException: Connection is not open.`。

`Dapper`会缓存每一次查询语句，因此推荐的做法是使用参数化方式进行传参，一方面能提高 SQL 执行效率，另一方面可以减少内存占用。

更多用法可以参考官方文档：https://github.com/DapperLib/Dapper

## 最佳实践

原生 ADO.NET 能够带来非常优秀的性能，但是缺点就是需要大量的手写 SQL 和类型转换，对于应用开发不是很友好。而 ORM 框架虽然解决了代码复杂度的问题，但也带来了新的问题，就是无法精准控制 SQL 的行为不够灵活，以及大幅性能损耗。

所以在实际项目中，推荐使用`Entity Framework`+`Dapper`的组合，底层数据驱动选择`MySqlConnector`，简单读写场景交给`Entity Framework`去处理，想高度控制 SQL 的场景交给`Dapper`去处理，兼顾了性能和开发效率两方面。`Entity Framework`的上下文对象提供了一个访问原始 ADO.NET Connection 的入口，这就使得把两者结合起来非常方便。

需要导入的程序集：

- `Microsoft.EntityFrameworkCore`
- `Pomelo.EntityFrameworkCore.MySql`
- `Dapper`

使用示例：

```c#
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;
using Dapper;

public async Task TestWithDapper()
{
    using var context = new BookShopContext();
    var conn = context.Database.GetDbConnection();

    // 使用 dapper 查询
    string version = conn.ExecuteScalar<string>("select tidb_version()");
    Console.WriteLine(version);

    // 使用 EF 查询
    var book = context.Books.Where(u => u.Id == 1).FirstOrDefault();

    // 共享事务，类似的还可以使用 TransactionScope 或 EF 的 UseTransaction
    using IDbContextTransaction tnx = context.Database.BeginTransaction();
    conn.ExecuteScalar<dynamic>("select /*+ read_from_storage(tiflash[ratings]) */ book_id,count(*),avg(score) from ratings group by book_id", transaction: tnx.GetDbTransaction());
    context.Books.Add(new Book { });
    await tnx.CommitAsync();
}
```

> 【注意】
>
> `using`会自动处理`IDbContextTransaction`对象的`rollback`和`dispose`，如果没有使用`using`语法，需要手动处理事务异常情况。

还有其他一些 ORM 框架例如 [NHibernate](https://www.nhibernate.info/)、[FreeSql](http://freesql.net/) 等使用方式大同小异，底层都是依赖前面提到的数据库驱动，参考各自 API 文档即可。

## 总结

以上演示了 C# 在多种数据库访问方式下实现对 TiDB 的简单 CRUD 功能，整体来说和操作 MySQL 区别不大，但是在这个过程中我们要善于利用 TiDB 的特性提升应用程序的处理能力。

关于更多的复杂场景，如何在 TiDB 上做 SQL 开发和性能调优，推荐阅读以下文档：

- [TiDB 与 MySQL 兼容性对比](https://docs.pingcap.com/zh/tidb/stable/mysql-compatibility)
- [TiDB 数据库开发规范](https://asktug.com/t/topic/664889)
- [TiDB 应用开发者手册](https://docs.pingcap.com/zh/tidb/stable/dev-guide-overview)
