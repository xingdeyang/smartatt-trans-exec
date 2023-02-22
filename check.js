const fs            = require('fs')
const superagent    = require('superagent')

function mapLimit (list, limit, asyncHandle) {
    let listCopy = list
    limit = limit < listCopy.length ? limit : listCopy.length
    let asyncList = []
    let recursion = (arr) => {
        return asyncHandle(arr.shift()).then(()=>{
            if (arr.length !== 0) {
                return recursion(arr)
            } else {
                return 'finish'
            }
        })
    };
    while(limit--) {
        asyncList.push(recursion(listCopy))
    }
    return Promise.all(asyncList)
}

class App {
    eids = []

    foreachData (arr) {
        for(let i = 0; i < arr.length; i++) {
            // 有异常
            if (arr[i].status === 5) {
                return false
            }
        }
        return true
    }

    async filter () {
        const settingList = []
        const applyList = []
        await mapLimit(this.eids, 10, async id => {
            const { body } = await superagent.get(`https://yunzhijia.com/smartatt-clock/manage/transferlog?eid=${id}`)
            const data = body.data || []
            let settingsIndex = 0
            let applyIndex = 0
            let removeIndex = 0
            // 获取最后一次迁移配置结束index
            for(let i = 0; i < data.length; i++) {
                if (data[i].processDes === '签到配置迁移任务执行结束' || data[i].processDes.includes('智能审批')) {
                    settingsIndex = i
                    break
                }
            }
            for(let i = settingsIndex; i < data.length; i++) {
                // 有异常
                if (data[i].status === 5) {
                    console.log(id + ': ' + data[i].processDes)
                    break
                }
                if (data[i].processDes === '开始执行清除考勤配置任务') {
                    settingList.push(id)
                    break
                }
            }
            return id
        })
        return {
            applyList,
            settingList
        }
    }

    init() {    
        const firstTime = new Date()
        fs.readFile(__dirname + '/transfer.txt', 'utf8', (err, data) => {
            if (err) {
                console.log('读取文件错误')
            } else {
                this.eids = data.split('\r\n')
                this.filter().then(res => {
                    fs.writeFile(__dirname + '/check.txt', res.settingList.join('\n'), (err) => {
                        if (err) {
                            console.log('写入文件失败')
                        } else {
                            const lastTimme = new Date()
                            console.log(`配置迁移成功表生成总耗时${(lastTimme - firstTime) / 1000}s`)
                        }
                    })
                })
            }
        }) 
    }
}

const app = new App()
app.init()