---
title: TiDB 的数据加载性能调优方案 - TiDB 社区技术月刊
sidebar_label: TiDB 的数据加载性能调优方案
hide_title: true
description: 本文将详细分析 TiDB 数据加载的性能调优方案。
keywords: [TiDB, 6.5 LTS, 易用性, 灾备能力]
---

# TiDB 的数据加载性能调优方案

> 作者：[heiheipp](https://asktug.com/u/heiheipp/summary) 、[Gin](https://asktug.com/u/gin/summary)

## 一、数据加载调优项

1. 调整数据加载程序的 jdbc 连接串：`JDBC:mysql://{TiDBIP}:{TiDBPort}/{DBName}?characterEncoding=utf8&useSSL=false&useServerPrepStmts=true&cachePrepStmts=true&prepStmtCacheSqlLimit=10000000&useConfigs=maxPerformance&rewriteBatchedStatements=true&defaultfetchsize=-2147483648`
2. 将单行 insert 改为 batch insert 方式写入数据，形如 `insert into table values(),(),(),()......,();`
3. 增加配置参数用于灵活调整 batch insert 语句的 batch size，最佳实践的 batch size 为 100\~300 之间，也就是每个 insert 语句写入 100\~300 行记录，每个 insert 作为一个事务，自动提交。
4. batch insert 的并发可以调整到 64 或更高，同样需要增加配置参数用于灵活调整并发数。
5. 并发调高了，但在 TiDB 上观察连接数不够，可能是连接池设置问题，参考本文调整连接池最大连接数：[专栏 - 使用 TiDB 时的连接池和负载均衡器配置策略 | TiDB 社区](https://tidb.net/blog/55452f4f)
6. 经常需要进行大量数据加载的表，需要设置为非聚簇索引表，并在表结构上增加 `SHARD_ROW_ID_BITS` 和 `PRE_SPLIT_REGIONS` 以避免写入热点，参考官方文档进行调整 [TiDB 热点问题处理 | PingCAP 文档中心](https://docs.pingcap.com/zh/tidb/dev/troubleshoot-hot-spot-issues#%E4%BD%BF%E7%94%A8-shard_row_id_bits-%E5%A4%84%E7%90%86%E7%83%AD%E7%82%B9%E8%A1%A8)
7. 先创建索引，再加载数据。

## 二、MyBatis 的 batch insert 示例代码

### 1. 配置信息

程序基于 Sprint Boot 框架，在工程 resources 目录下的 application.yml 或 properties 文件中指定可被 spring context 获取的batch 提交参数，该参数用于程序中控制每一批提交的行数，如下图所示：

![图片1.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片1-1675218225825.png)

图1

### 2. 程序内容

#### 2.1 获取配置

通过 spring 的 `@Value`或 `@ConfigurationProperties` 注解获取上述文件中的控制参数，本示例采用的是后者，即通过单独的参数实体类进行的数据封装，如下图所示：

![图片2.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片2-1675218313865.png)

图2

参考类文件 CtiqTransMainTableConfigModel.java：

```markdown
package com.heiheipp.dataprepare.model;

import com.heiheipp.common.config.AbstractConfigModel;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * @author heiheipp
 * @version 1.0
 * @className CtiqTransMainTableConfigModel
 * @desc TODO
 * @date 2022/3/16 17:05
 */
@Data
@Component("ctiqTransMainTableConfigModel")
@ConfigurationProperties(prefix = "ctiq.config.transmaintable")
public class CtiqTransMainTableConfigModel extends AbstractConfigModel {

    /**
     * 客户数量
     */
    private int custNum;

    /**
     * 每个客户的卡号数量
     */
    private int perCustCardNums;

    /**
     * 客户每日交易笔数
     */
    private int custTransNumEveryday;

    /**
     * 交易日期跨度
     */
    private int days;

    /**
     * 交易起始日期
     */
    private String startDay;

    /**
     * 交易终止日期
     */
    private String endDay;

    /**
     * 数据库单批次提交数量
     */
    private int batchNum;

    /**
     * 客户类型
     */
    private String custType;

    /**
     * 个人客户号前缀
     */
    private String personalCustIdPrefix;

    /**
     * 对公客户号前缀
     */
    private String companyCustIdPrefix;

    /**
     * 客户号长度
     */
    private int custIdLength;

    /**
     * 卡号前缀
     */
    private String cardBin;

    /**
     * 卡号长度
     */
    private int cardLength;

    /**
     * 账号前缀
     */
    private String accountPrefix;

    /**
     * 账号长度
     */
    private int accountLength;

    /**
     * 获取配置模型描述
     * @return
     */
    @Override
    public String getConfigModelDesc() {
        return "真实场景交易基础信息主表";
    }

    /**
     * 获取总处理数量
     * @return
     */
    @Override
    public int getTotalNums() {
        return getCustNum();
    }

    /**
     * 获取表头文件名
     * @return
     */
    @Override
    public String getFileHeaderName() {
        return "test_table_1_header.csv";
    }

    /**
     * 获取表文件名
     * @return
     */
    @Override
    public String getTargetFileName() {
        return "test_table_1.csv";
    }
}
```

#### 2.2 程序控制

在另外的造数程序中，通过获取上述类的控制参数，通过循环控制的方式进行定制化批次大小的触发，即先循环构建每一条待插入的记录，并缓存到list对象中，再由数据库写入方法按照批次大小判断是否提交：

![图片3.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片3-1675218595211.png)

图3

![图片4.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片4-1675218616027.png)

图4

参考类文件 CtiqTransMainTableFutureTask.java：

```markdown
package com.heiheipp.dataprepare.executor;

import cn.hutool.core.date.DateUnit;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.date.SystemClock;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.NumberUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import com.github.javafaker.Faker;
import com.heiheipp.common.constant.ConfigConstant;
import com.heiheipp.common.context.RuntimeContext;
import com.heiheipp.common.context.SpringContextUtil;
import com.heiheipp.common.executor.AbstractFutureTask;
import com.heiheipp.common.mbg.model.TestTable1;
import com.heiheipp.common.service.TaskLogService;
import com.heiheipp.common.service.TestTable1Service;
import com.heiheipp.common.util.DataBuildUtil;
import com.heiheipp.common.util.DateTimeUtil;
import com.heiheipp.common.constant.DataModelConstant;
import com.heiheipp.dataprepare.model.CtiqTransMainTableConfigModel;
import com.heiheipp.dataprepare.service.impl.CTIQDataPrepareServiceImpl;

import java.io.File;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import lombok.extern.slf4j.Slf4j;

/**
 * @author heiheipp
 * @version 1.0
 * @className CtiqTransMainTableFutureTask
 * @desc TODO
 * @date 2022/3/16 16:58
 */
@Slf4j
public class CtiqTransMainTableFutureTask extends AbstractFutureTask<String> {

    private int targetType;

    private String fileLocation;

    private int threadCustNums;

    private long threadTotalNums;

    private int batchNums;

    private TaskLogService taskLogService;

    private TestTable1Service testTable1Service;

    private Map<String, Object> runtimeDatas = new ConcurrentHashMap<>();

    private String subThreadId;

    private AtomicLong processedNums = new AtomicLong(0L);

    private int committedRows = 0;

    private int startOffset;

    private CtiqTransMainTableConfigModel configModel;

    private Faker faker = new Faker(Locale.CHINA);

    private boolean isFirstLine;

    private SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd");

    private Date start;

    private Date end;

    private long dayBetween = 1L;

    private boolean isRegisterDBLog;

    /**
     * 构造函数
     *
     * @param parentThreadId
     * @param threadCustNums
     * @param threadOrder
     * @param configModel
     */
    public CtiqTransMainTableFutureTask(long parentThreadId, int threadCustNums, int threadOrder,
                                        CtiqTransMainTableConfigModel configModel) {
        this.parentThreadId = String.valueOf(parentThreadId);
        this.threadCustNums = threadCustNums;
        this.taskLogService = SpringContextUtil.getBean(TaskLogService.class);
        this.testTable1Service = SpringContextUtil.getBean(TestTable1Service.class);
        this.configModel = configModel;
        this.batchNums = this.configModel.getBatchNum();

        // 参数计算
        this.startOffset = this.threadCustNums * configModel.getPerCustCardNums() * threadOrder + 1;
        this.targetType = SpringContextUtil.getBean(CTIQDataPrepareServiceImpl.class).getTargetType();
        this.fileLocation = SpringContextUtil.getBean(CTIQDataPrepareServiceImpl.class).getFileLocation();
        this.isFirstLine = !SpringContextUtil.getBean(CTIQDataPrepareServiceImpl.class).isFileMerge();
        this.isRegisterDBLog = SpringContextUtil.getBean(CTIQDataPrepareServiceImpl.class).isRegisterDBLog();

        // 以startDay和endDay计算要循环的天数
        if (!StrUtil.isEmpty(configModel.getStartDay()) && !StrUtil.isEmpty(configModel.getEndDay())) {
            try {
                this.start = this.dateFormat.parse(configModel.getStartDay());
                this.end = this.dateFormat.parse(configModel.getEndDay());

                // 日期校验
                if (this.start.compareTo(this.end) > 0) {
                    log.error("起始日期不能大于终止日期");
                    throw new RuntimeException("起始日期不能大于终止日期");
                }

                // 计算时间差
                this.dayBetween = DateUtil.between(this.start, this.end, DateUnit.DAY) + 1L;
            } catch (ParseException e) {
                log.error("子线程[{}]解析起始、终止时间异常", this.subThreadId);
                e.printStackTrace();
                throw new RuntimeException("解析起始、终止时间异常");
            }
        } else if (configModel.getDays() > 0) {
            this.dayBetween = configModel.getDays();
        }

        // 计算当前子线程要处理的总记录数
        this.threadTotalNums = (threadCustNums * configModel.getCustTransNumEveryday()) * this.dayBetween;
    }

    /**
     * 任务执行方法
     *
     * @return
     */
    @Override
    protected String submit(long subThreadId) {
        String result = "";
        this.subThreadId = String.valueOf(subThreadId);
        long startTime = System.currentTimeMillis();

        log.info("Sub thread[{}] start, threadTotalNums is {}, custNums is {}, duration is {} days, batchNums is {}, startOffset is {}, isRegisterDBLog is {}.",
                this.subThreadId, this.threadTotalNums, this.threadCustNums, this.dayBetween,
                this.batchNums, this.startOffset, this.isRegisterDBLog);

        // 计算公共变量
        String fileName = null;
        if (this.targetType == 2) {
            fileName = "boc_poc.test_table_1.0" + this.subThreadId + ".csv";
            this.fileLocation = this.fileLocation.equalsIgnoreCase("default") ?
                    new File(".").getAbsolutePath() : this.fileLocation;
            this.fileLocation += File.separator + fileName;
            log.info("Sub thread[{}] write data to file[{}].", this.subThreadId, this.fileLocation);

            // 将文件名写入主线程
            SpringContextUtil.getBean(CTIQDataPrepareServiceImpl.class).getTmpFileNameList().add(this.fileLocation);
        }

        // 处理业务公共信息
        int custIdFillLength;
        String custIdPrefix = null;
        switch (this.configModel.getCustType()) {
            case "Personal":
                custIdFillLength = this.configModel.getCustIdLength() -
                        this.configModel.getPersonalCustIdPrefix().length() - DataModelConstant.PROVINCE_LENGTH;
                custIdPrefix = this.configModel.getPersonalCustIdPrefix();
                break;
            case "Company":
                custIdFillLength = this.configModel.getCustIdLength() -
                        this.configModel.getCompanyCustIdPrefix().length() - DataModelConstant.PROVINCE_LENGTH;
                custIdPrefix = this.configModel.getCompanyCustIdPrefix();
                break;
            default:
                custIdFillLength = 0;
                custIdPrefix = "";
                break;
        }

        int cardNoFillLength = this.configModel.getCardLength() - this.configModel.getCardBin().length();
        String cardNoPrefix = this.configModel.getCardBin();
        int accountFillLength = this.configModel.getAccountLength() - this.configModel.getAccountPrefix().length();
        String accountPrefix = this.configModel.getAccountPrefix();

        // 登记任务开始日志
        if (isRegisterDBLog) {
            recordTask(ConfigConstant.TaskStatusEnum.START);
        }

        // 制造数据
        List<TestTable1> testTable1s = new ArrayList<>();
        TestTable1 testTable1 = null;
        int currentPercentage = 0, prevPercentage = 0;
        try {
            for (int i = 0; i < this.threadCustNums; i++) {
                // 按单客户每次交易笔数制造数据
                buildMultiTestTable1(testTable1s, testTable1, custIdPrefix, cardNoPrefix, accountPrefix, i,
                        custIdFillLength, cardNoFillLength, accountFillLength);

                // 数据写入操作
                if (this.processedNums.get() < this.threadTotalNums) {
                    writeData(testTable1s, false);
                } else {
                    writeData(testTable1s, true);
                }

                // 登记任务处理中日志
                prevPercentage = currentPercentage;
                currentPercentage = DataBuildUtil.getPercentge(this.processedNums.get(), this.threadTotalNums);
                if (DataBuildUtil.getPercentageWtihTens(this.processedNums.get(), this.threadTotalNums) &&
                        prevPercentage < currentPercentage) {
                    if (isRegisterDBLog) {
                        recordTask(ConfigConstant.TaskStatusEnum.PROCESSING);
                    }
                    log.info("Sub thread {} has been processing {}%, processedNums is {}, totalNums is {}, execution time is {}.",
                            this.subThreadId, currentPercentage, this.processedNums.get(), this.threadTotalNums,
                            SystemClock.now() - startTime);
                }
            }

            // 补提交剩余部分
            writeData(testTable1s, true);
        } catch (Exception e) {
            log.error("Sub thread {} error, and execution time is {}ms.", this.subThreadId,
                    System.currentTimeMillis() - startTime);
            e.printStackTrace();

            // 登记任务失败信息
            if (isRegisterDBLog) {
                recordTask(ConfigConstant.TaskStatusEnum.ERROR);
            }
        } finally {
            log.info("Sub thread {} finish, and execution time is {}ms.", this.subThreadId,
                    System.currentTimeMillis() - startTime);

            // 登记任务结束信息
            if (isRegisterDBLog) {
                recordTask(ConfigConstant.TaskStatusEnum.SUCCESS);
            }

            // 清理线程上下文
            RuntimeContext.clearRuntimeData();

            // 计数器操作
            CTIQDataPrepareServiceImpl.getCountDownLatch().countDown();
        }
        return result;
    }

    /**
     * 构建任务日志数据
     */
    private void buildRuntimeDatas(ConfigConstant.TaskStatusEnum taskStatusEnum, Object... args) {
        switch (taskStatusEnum) {
            case START:
                // 登记开始任务
                runtimeDatas.put(ConfigConstant.PARENT_THREAD_ID_KEY, this.parentThreadId);
                runtimeDatas.put(ConfigConstant.SUB_THREAD_ID_KEY, subThreadId);
                runtimeDatas.put(ConfigConstant.TASK_TYPE_KEY, ConfigConstant.TaskTypeEnum.DATA_PREPARE.getTypeDesc());
                runtimeDatas.put(ConfigConstant.TASK_CONTENT_KEY, getTaskContent());
                runtimeDatas.put(ConfigConstant.TASK_STATUS_KEY, ConfigConstant.TaskStatusEnum.START.getStatus());
                runtimeDatas.put(ConfigConstant.TASK_TOTAL_NUMS_KEY, this.threadTotalNums);
                runtimeDatas.put(ConfigConstant.TASK_PROCESSED_NUMS_KEY, 0L);
                runtimeDatas.put(ConfigConstant.TASK_CREATE_TIME_KEY, SystemClock.now());
                runtimeDatas.put(ConfigConstant.TASK_UPDATE_TIME_KEY, SystemClock.now());
                runtimeDatas.put(ConfigConstant.TASK_STATUS_ENUM_KEY, ConfigConstant.TaskStatusEnum.START);
                break;
            case PROCESSING:
                // 更新处理中任务
                runtimeDatas.put(ConfigConstant.TASK_STATUS_KEY, ConfigConstant.TaskStatusEnum.PROCESSING.getStatus());
                runtimeDatas.put(ConfigConstant.TASK_PROCESSED_NUMS_KEY, processedNums.get());
                runtimeDatas.put(ConfigConstant.TASK_STATUS_ENUM_KEY, ConfigConstant.TaskStatusEnum.PROCESSING);
                runtimeDatas.put(ConfigConstant.TASK_UPDATE_TIME_KEY, SystemClock.now());
                break;
            case ERROR:
                // 任务异常
                runtimeDatas.put(ConfigConstant.TASK_STATUS_KEY, ConfigConstant.TaskStatusEnum.ERROR.getStatus());
                runtimeDatas.put(ConfigConstant.TASK_PROCESSED_NUMS_KEY, processedNums.get());
                runtimeDatas.put(ConfigConstant.TASK_STATUS_ENUM_KEY, ConfigConstant.TaskStatusEnum.ERROR);
                runtimeDatas.put(ConfigConstant.TASK_UPDATE_TIME_KEY, SystemClock.now());
                break;
            case SUCCESS:
                // 任务成功结束
                runtimeDatas.put(ConfigConstant.TASK_STATUS_KEY, ConfigConstant.TaskStatusEnum.SUCCESS.getStatus());
                runtimeDatas.put(ConfigConstant.TASK_PROCESSED_NUMS_KEY, processedNums.get());
                runtimeDatas.put(ConfigConstant.TASK_STATUS_ENUM_KEY, ConfigConstant.TaskStatusEnum.SUCCESS);
                runtimeDatas.put(ConfigConstant.TASK_UPDATE_TIME_KEY, SystemClock.now());
                break;
            default:
                break;
        }
    }

    /**
     * 获取任务类型
     *
     * @return
     */
    private String getTaskContent() {
        return "TEST_TABLE_1表数据准备";
    }

    /**
     * 登记任务日志
     *
     * @param taskStatusEnum
     */
    private void recordTask(ConfigConstant.TaskStatusEnum taskStatusEnum) {
        switch (taskStatusEnum) {
            case START:
                // 登记任务开始日志
                buildRuntimeDatas(ConfigConstant.TaskStatusEnum.START);
                break;
            case PROCESSING:
                // 登记任务处理中日志
                buildRuntimeDatas(ConfigConstant.TaskStatusEnum.PROCESSING);
                break;
            case ERROR:
                // 登记任务失败信息
                buildRuntimeDatas(ConfigConstant.TaskStatusEnum.ERROR);
                break;
            case SUCCESS:
                // 登记任务结束信息
                buildRuntimeDatas(ConfigConstant.TaskStatusEnum.SUCCESS);
                break;
            default:
                break;
        }

        RuntimeContext.setRuntimeDatas(runtimeDatas);

        try {
            taskLogService.recordTaskLog();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * 构建TestTable1对象
     * @param testTable1
     * @param custId
     * @param cardNoArray
     * @param accountArray
     * @param custName
     * @param startLongTime
     * @param endLongTime
     */
    private void buildTestTable1(TestTable1 testTable1, String custId, String[] cardNoArray, String[] accountArray,
                                 String custName, long startLongTime, long endLongTime) {
        int num = DataBuildUtil.getIntegerRandom(this.configModel.getPerCustCardNums());

        testTable1.setColumn1(new BigDecimal(IdUtil.getSnowflakeNextIdStr()));
        testTable1.setColumn2(DataBuildUtil.getRandomWithLength(3));
        //testTable1.setColumn3(DataBuildUtil.getRandomWithLength(5));
        testTable1.setColumn3(String.valueOf(RandomUtil.randomInt(1, 10000)));
        testTable1.setColumn4(accountArray[num]);
        testTable1.setColumn5(new Timestamp(DateTimeUtil.randomLongTime(startLongTime, endLongTime)));
        testTable1.setColumn6(DataBuildUtil.getRandomWithLength(8));
        testTable1.setColumn7(DataBuildUtil.getRandomWithLength(8));
        testTable1.setColumn8(DataBuildUtil.getRandomWithLength(5));
        testTable1.setColumn9(testTable1.getColumn4());
        testTable1.setColumn10("0001");
        //testTable1.setColumn11(Integer.valueOf(DataBuildUtil.getRandomWithLength(3)));
        testTable1.setColumn11(RandomUtil.randomInt(1, 999));
        testTable1.setColumn12(Integer.valueOf(DataBuildUtil.getRandomWithLength(2)));
        testTable1.setColumn13(DataBuildUtil.getRandomWithLength(12));
        testTable1.setColumn14(UUID.randomUUID().toString().replaceAll("-", ""));
        testTable1.setColumn15(DataBuildUtil.getRandomWithLength(4));
        testTable1.setColumn16(DataBuildUtil.getRandomWithLength(4));
        testTable1.setColumn17(DataBuildUtil.generateMsg("某", 12, "产品"));
        testTable1.setColumn18(DataBuildUtil.generateMsg("某", 16, "文书合同"));
        testTable1.setColumn19("1");
        testTable1.setColumn20("01");
        testTable1.setColumn21("001");
        testTable1.setColumn22(cardNoArray[num]);
        testTable1.setColumn23("01");
        testTable1.setColumn24("1");
        testTable1.setColumn25(DataBuildUtil.getTranType());
        testTable1.setColumn26(DataBuildUtil.getTranTypeDesc(testTable1.getColumn25()));
        testTable1.setColumn27(DateUtil.date(testTable1.getColumn5().getTime()).toTimeStr());
        testTable1.setColumn28(DataBuildUtil.getRandomWithLength(7));
        testTable1.setColumn29(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn30(DataModelConstant.DEFAULT_BRANCH_NAME);
        testTable1.setColumn31(DateUtil.parse("2021-05-01", "yyyy-MM-dd"));
        testTable1.setColumn32("0");
        testTable1.setColumn33("112233");
        testTable1.setColumn34("112233");
        testTable1.setColumn35("01");
        testTable1.setColumn36("提示码");
        testTable1.setColumn37(DataBuildUtil.getChannel());
        testTable1.setColumn38(DateUtil.date(testTable1.getColumn5().getTime()).toSqlDate());
        testTable1.setColumn39(testTable1.getColumn13());
        testTable1.setColumn40("156");
        testTable1.setColumn41("CNY");
        testTable1.setColumn42(NumberUtil.round("1.00", 2));
        testTable1.setColumn43(DataBuildUtil.getDebitOrCreditFlag());
        testTable1.setColumn44(DataBuildUtil.getChongzhengFlag(testTable1.getColumn43()));
        testTable1.setColumn45(DataBuildUtil.getRandomBigDecimal(10000, 2));
        testTable1.setColumn46(testTable1.getColumn45().add(new BigDecimal(100)));
        testTable1.setColumn47(testTable1.getColumn46());
        testTable1.setColumn48(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn49(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn50(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn51(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn52(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn53(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn54(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn55(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn56(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn57(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn58(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn59(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn60(DataBuildUtil.generateMsg("某", 30, "备注"));
        testTable1.setColumn61(DataBuildUtil.generateMsg("某", 15, "用途"));
        testTable1.setColumn62(DataBuildUtil.generateMsg("某", 30, "附言"));
        testTable1.setColumn63(DataBuildUtil.generateMsg("某", 30, "摘要"));
        testTable1.setColumn64("1");
        testTable1.setColumn65("现钞");
        testTable1.setColumn66(DataModelConstant.DEFAULT_PAYER_NAME);
        testTable1.setColumn67("1234567890123456789");
        testTable1.setColumn68("1234567890123456789");
        testTable1.setColumn69("1111");
        testTable1.setColumn70(Integer.valueOf(DataBuildUtil.getRandomWithLength(3)));
        testTable1.setColumn71(Integer.valueOf(DataBuildUtil.getRandomWithLength(2)));
        testTable1.setColumn72(DataModelConstant.DEFAULT_BRANCH_NAME);
        testTable1.setColumn73(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn74(DataModelConstant.DEFAULT_PROVINCE_LH_NO);
        // 付款人姓名
        if ("D".equalsIgnoreCase(testTable1.getColumn43())) {
            testTable1.setColumn75(custName);
        } else {
            testTable1.setColumn75(DataModelConstant.DEFAULT_PAYER_NAME);
        }

        testTable1.setColumn76("1234567890123456789");
        testTable1.setColumn77("12345678901234567890001");
        testTable1.setColumn78("1111");
        testTable1.setColumn79(Integer.valueOf(DataBuildUtil.getRandomWithLength(3)));
        testTable1.setColumn80(Integer.valueOf(DataBuildUtil.getRandomWithLength(2)));
        testTable1.setColumn81(DataModelConstant.DEFAULT_BRANCH_NAME);
        testTable1.setColumn82(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn83(DataModelConstant.DEFAULT_PROVINCE_LH_NO);
        testTable1.setColumn84(DataModelConstant.DEFAULT_RECEIVER_NAME);
        testTable1.setColumn85("9876543210987654321");
        testTable1.setColumn86("12345678901234567890001");
        testTable1.setColumn87("1111");
        testTable1.setColumn88(Integer.valueOf(DataBuildUtil.getRandomWithLength(3)));
        testTable1.setColumn89(Integer.valueOf(DataBuildUtil.getRandomWithLength(2)));
        testTable1.setColumn90(DataModelConstant.DEFAULT_BRANCH_NAME);
        testTable1.setColumn91(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn92(DataModelConstant.DEFAULT_PROVINCE_LH_NO);
        // 收款人姓名
        if ("C".equalsIgnoreCase(testTable1.getColumn43())) {
            testTable1.setColumn93(custName);
        } else {
            testTable1.setColumn93(DataModelConstant.DEFAULT_RECEIVER_NAME);
        }

        testTable1.setColumn94("9876543210987654321");
        testTable1.setColumn95("98765432109876543210001");
        testTable1.setColumn96("1111");
        testTable1.setColumn97(Integer.valueOf(DataBuildUtil.getRandomWithLength(3)));
        testTable1.setColumn98(Integer.valueOf(DataBuildUtil.getRandomWithLength(2)));
        testTable1.setColumn99(DataModelConstant.DEFAULT_BRANCH_NAME);
        testTable1.setColumn100(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn101(DataModelConstant.DEFAULT_PROVINCE_LH_NO);
        testTable1.setColumn102("2222");
        testTable1.setColumn103(DataBuildUtil.generateMsg("某", 2, "凭证"));
        testTable1.setColumn104("112233445566778899");
        testTable1.setColumn105("2222");
        testTable1.setColumn106(DataBuildUtil.generateMsg("某", 2, "产生凭证"));
        testTable1.setColumn107("112233445566778899");
        testTable1.setColumn108("998877665544332211");
        testTable1.setColumn109("1111");
        testTable1.setColumn110(Integer.valueOf(4));
        testTable1.setColumn111(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn112(DataModelConstant.ZERO_AMOUNT);
        testTable1.setColumn113(DataModelConstant.DEFAULT_ADDRESS_PHONE);
        testTable1.setColumn114(DataModelConstant.DEFAULT_ADDRESS_PHONE);
        testTable1.setColumn115("1122334455");
        testTable1.setColumn116("1122334455");
        testTable1.setColumn117("1122334455");
        testTable1.setColumn118("1122334455");
        testTable1.setColumn119("1122334455");
        testTable1.setColumn120("1122334455");
        testTable1.setColumn121(DataBuildUtil.generateMsg("某", 1, "系统"));
        testTable1.setColumn122("11111");
        testTable1.setColumn123(DateUtil.date(testTable1.getColumn5().getTime()).toSqlDate());
        testTable1.setColumn124("1111");
        testTable1.setColumn125("11111");
        testTable1.setColumn126("1");
        testTable1.setColumn127("1");
        testTable1.setColumn128("11112222");
        testTable1.setColumn129(DataModelConstant.DEFAULT_BRANCH_NO);
        testTable1.setColumn130("1");
        testTable1.setColumn131("1");
        testTable1.setColumn132("1");
        testTable1.setColumn133("1");
        testTable1.setColumn134(DateUtil.date(testTable1.getColumn5().getTime()).toSqlDate());
        testTable1.setColumn135("1");
        testTable1.setColumn136("1");
        testTable1.setColumn137("1");
        testTable1.setColumn138("1");
        testTable1.setColumn139("1");
        testTable1.setColumn140("1");
        testTable1.setColumn141("1");
        testTable1.setColumn142("1");
        testTable1.setColumn143("1");
        testTable1.setColumn144(custId);
        testTable1.setColumn145("1");
        testTable1.setColumn146("1");

        // 生成json字符串
        testTable1.setColumn151(DataModelConstant.DEFAULT_JSON_STRING);
    }

    /**
     * 构建TestTable1列表
     * @param testTable1s
     * @param testTable1
     * @param custIdPrefix
     * @param cardNoPrefix
     * @param accountPrefix
     * @param currentOffset
     * @param custIdFillLength
     * @param cardNoFillLength
     * @param accountFillLength
     */
    private void buildMultiTestTable1(List<TestTable1> testTable1s, TestTable1 testTable1, String custIdPrefix,
                                      String cardNoPrefix, String accountPrefix, int currentOffset,
                                      int custIdFillLength, int cardNoFillLength, int accountFillLength) {
        // 公共信息
        int offset = currentOffset * this.configModel.getPerCustCardNums();
        String custId = DataBuildUtil.generateCustId(custIdPrefix, this.startOffset, offset, custIdFillLength);
        String custName = this.faker.name().fullName();
        String[] cardNoArray = new String[this.configModel.getPerCustCardNums()];
        String[] accountArray = new String[this.configModel.getPerCustCardNums()];
        for (int k = 0; k < this.configModel.getPerCustCardNums(); k++) {
            cardNoArray[k] = DataBuildUtil.generateCardNo(cardNoPrefix, this.startOffset,
                    offset + k, cardNoFillLength);
            accountArray[k] = DataBuildUtil.generateAccount(accountPrefix, this.startOffset,
                    offset + k, accountFillLength);
        }

        // 外层按照日期循环
        for (int i = 0; i < (new Long(this.dayBetween)).intValue(); i++) {
            long startLongTime = DateUtil.offsetDay(this.start, i).getTime();
            long endLongTime = DateUtil.offsetDay(this.start, i + 1).getTime() - 1L;

            // 内层按照每日交易数循环
            for (int j = 0; j < this.configModel.getCustTransNumEveryday(); j++) {
                testTable1 = new TestTable1();
                buildTestTable1(testTable1, custId, cardNoArray, accountArray, custName, startLongTime, endLongTime);

                testTable1s.add(testTable1);

                // 递增总生成数量和待提交数量
                this.processedNums.incrementAndGet();
                this.committedRows++;
            }
        }
    }

    /**
     * 写文件操作
     * @param testTable1s
     * @param flag
     */
    private void writeData(List<TestTable1> testTable1s, boolean flag) {
        if (testTable1s.size() > 0) {
            if (this.targetType == 1) {
                //写入数据库
                if (this.committedRows >= this.batchNums) {
                    this.testTable1Service.batchInsert(testTable1s);
                    testTable1s.clear();
                    this.committedRows = 0;
                } else if (flag) {
                    this.testTable1Service.batchInsert(testTable1s);
                    testTable1s.clear();
                    this.committedRows = 0;
                }
            } else if (this.targetType == 2) {
                //写入csv文件
                this.testTable1Service.writeCsv(this.fileLocation, testTable1s, this.isFirstLine);
                testTable1s.clear();
                this.isFirstLine = false;

                //末尾追加空行
                if (flag) {
                    this.testTable1Service.writeCsv();
                }
            }
        }
    }
}
```

#### 2.3 DAO 相关操作

本工程使用的是 MyBatis ORM 框架，在 mapper xml 文件中增加了 batchInsert sql，通过 foreach 方式进行的批量 insert，如下图：

![图片5.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片5-1675218791765.png)

图5

![图片6.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片6-1675218827118.png)

图6

对应的 mapper interface 类如下，红线部分主要是为了 mapper xml 中的参数定位：

![图片7.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片7-1675218874319.png)

图7

对应的 service 类通过 spring 事务的方式、以 `PROPAGATION_REQUIRES_NEW` 的事务传播方式进行的事务控制：

![图片8.png](https://tidb-blog.oss-cn-beijing.aliyuncs.com/media/图片8-1675218889829.png)

图8
