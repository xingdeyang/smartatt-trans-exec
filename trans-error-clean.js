const readline          = require('readline')
const fs                = require('fs')
const path              = require('path')
const http              = require('http')
const querystring       = require('querystring')
const dataQueue         = []
const batchInfo         = {
                            pageIndex: 1,
                            pageSize: 1,
                            count: 0
                        }
const crontab           = require('node-cron')
const config            = require('./config')

// 清理配置
function clean (eids) {
    return new Promise ((resolve, reject) => {
        let httpReq = http.request({
            hostname: config.hostname,
            method: 'POST',
            path: '/smartatt-clock/manage/cleanUp',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                '__signtoken': config.token
            },
        }, httpRes => {
            let bufferArr = []
            let size = 0
            httpRes.on('data', (chunk) => {
                bufferArr.push(chunk)
                size += chunk.length
            });
            httpRes.on('end', () => {
                try {
                    let resData = JSON.parse((Buffer.concat(bufferArr, size)).toString());
                    if (resData.success == true) {
                        console.log('******清理新考勤配置请求成功收到回包 %s', JSON.stringify(resData));
                    } else {
                        handleError(JSON.stringify(resData));
                    }
                } catch (e) {
                    handleError(e);
                }
            });
        });
        httpReq.on('error', (e) => {
            handleError(e);
        });
        httpReq.end(querystring.stringify({
            eids: eids.join(',')
        }));
    })
}

// 释放锁
function releaseLock () {
    return new Promise ((resolve, reject) => {
        let httpReq = http.get(`http://${config.hostname}/smartatt-clock/manage/deleteRedis`, httpRes => {
            let bufferArr = []
            let size = 0
            httpRes.on('data', (chunk) => {
                bufferArr.push(chunk)
                size += chunk.length
            });
            httpRes.on('end', () => {
                try {
                    let resData = JSON.parse((Buffer.concat(bufferArr, size)).toString());
                    if (resData.success == true) {
                        console.log("******当前批次主动释放锁成功")
                    } else {
                        handleError(resData);
                    }
                } catch (e) {
                    handleError(e);
                }
            });
        });
        httpReq.on('error', (e) => {
            handleError(e);
        });
    })
}

// 迁移配置
function trans (eids) {
    return new Promise ((resolve, reject) => {
        let httpReq = http.request({
            hostname: config.hostname,
            method: 'POST',
            path: '/smartatt-clock/manage/transform',
            headers: {
                'Content-Type': 'application/json',
                '__signtoken': config.token
            },
        }, httpRes => {
            let bufferArr = []
            let size = 0
            httpRes.on('data', (chunk) => {
                bufferArr.push(chunk)
                size += chunk.length
            });
            httpRes.on('end', () => {
                try {
                    let resData = JSON.parse((Buffer.concat(bufferArr, size)).toString());
                    if (resData.success == true) {
                        console.log('******迁移配置请求成功收到回包 %s', JSON.stringify(resData));
                    } else {
                        handleError(JSON.stringify(resData));
                    }
                } catch (e) {
                    handleError(e);
                }
            });
        });
        httpReq.on('error', (e) => {
            handleError(e);
        });
        httpReq.end(JSON.stringify({
            attendanceClazzTranslate: true,
            attendanceGroupTranslate: true,
            businessAdminTranslate: true,
            cloudflowTemplateTranslate: true,
            eids: eids,
            genDefaultSeniorPlan: true,
            holidayBalanceTranslate: true,
            holidayTranslate: true,
            nonSignPersonTranslate: true,
            shiftTranslate: true,
            superAdminTranslate: true
        }));
    })
}

function handleError (e) {
    console.error(e)
}

// 空转（保持迁移接口负载均衡）
function loadBalance () {
    return new Promise ((resolve, reject) => {
        let httpReq = http.get(`http://${config.hostname}/smartatt-clock/manage/index.html?${Date.now}`, httpRes => {});
        httpReq.on('error', (e) => {
            handleError(e);
        });
    })
}

// 批次初始化
async function batch () {
    const rl = readline.createInterface({
        input: fs.createReadStream(path.resolve(__dirname, './trans-error-clean.txt')),
        outpu: process.stdout
    })
    for await (const eid of rl) {
        dataQueue.push(eid)
    }
    batchInfo.count = Math.ceil(dataQueue.length/batchInfo.pageSize)
    console.log("当前迁移错误圈清理队列执行eid共计: %s 条, 需执行 %s 批次", dataQueue.length, batchInfo.count)
}

// 定时执行
async function init () {
    await batch()
    const task = crontab.schedule("*/15 * * * * *", async function () {
        let eids = dataQueue.slice((batchInfo.pageIndex - 1) * batchInfo.pageSize, batchInfo.pageIndex * batchInfo.pageSize)
        console.log("当前迁移错误圈清理执行第 %s 批，工作圈为：%s", batchInfo.pageIndex, JSON.stringify(eids))
        clean(eids)
        batchInfo.pageIndex++
        if (batchInfo.pageIndex > batchInfo.count) {
            console.log('******迁移错误圈清理定时任务over******')
        }
    })
}
init()