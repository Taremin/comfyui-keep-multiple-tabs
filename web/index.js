import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"

// バージョン文字列を数値配列にパースする
function parseVersion(versionStr) {
    const cleaned = versionStr.replace(/^v/, '').trim()
    const parts = cleaned.split('.').map(Number)
    if (parts.some(isNaN)) return null
    return parts
}

// 公式タブ永続化バグ修正が含まれるバージョンかどうか判定
// stable: v1.38.14以降、nightly/main: v1.40.4以降、v1.39.xはすべて含まれる
function isFixedVersion(version) {
    const parts = parseVersion(version)
    if (!parts || parts.length < 3) return false

    const [major, minor, patch] = parts
    if (major !== 1) return major > 1

    if (minor === 38) return patch >= 14
    if (minor === 39) return true
    if (minor === 40) return patch >= 4
    return minor > 40
}

// ComfyUIの言語設定を取得
function getLocale() {
    try {
        const locale = app.extensionManager?.setting?.get('Comfy.Locale')
            ?? app.ui?.settings?.getSettingValue('Comfy.Locale')
        if (locale) return locale
    } catch(e) {
        // フォールバック
    }
    return navigator.language || 'en'
}

// フロントエンドバージョンを取得する
async function getFrontendVersion() {
    // 方法1: グローバル変数から取得（Viteビルド時に定義される）
    try {
        if (typeof __COMFYUI_FRONTEND_VERSION__ !== 'undefined') {
            return __COMFYUI_FRONTEND_VERSION__
        }
    } catch(e) {
        // フォールバック
    }

    // 方法2: /system_stats の required_frontend_version を間接的な判定基準として使用
    try {
        const resp = await api.fetchApi('/system_stats')
        if (resp.ok) {
            const data = await resp.json()
            return data?.system?.required_frontend_version ?? null
        }
    } catch(e) {
        console.debug("[keep-multiple-tabs] /system_stats 取得失敗:", e)
    }

    return null
}

// 非推奨通知を表示
async function checkAndNotifyDeprecation() {
    // セッション中に1回のみ表示
    if (sessionStorage.getItem('keep-multiple-tabs-deprecation-notified')) return

    try {
        const version = await getFrontendVersion()
        if (!version || !isFixedVersion(version)) return

        const locale = getLocale()
        const message = locale.startsWith('ja')
            ? 'このバージョンのComfyUIにはワークフロータブの自動保存機能が組み込まれています。この拡張機能は不要になったため、アンインストールをご検討ください。'
            : 'ComfyUI has built-in workflow tab persistence since this version. This extension is no longer needed and may cause conflicts. Please consider uninstalling it.'

        // トースト通知を表示
        if (app.extensionManager?.toast) {
            app.extensionManager.toast.add({
                severity: 'warn',
                summary: 'keep-multiple-tabs',
                detail: message,
                life: 15000
            })
        } else {
            // トーストAPIが利用できない場合はコンソール警告
            console.warn(`[keep-multiple-tabs] ${message}`)
        }

        sessionStorage.setItem('keep-multiple-tabs-deprecation-notified', '1')
    } catch(e) {
        // バージョン取得に失敗した場合は何もしない（フェイルセーフ）
        console.debug("[keep-multiple-tabs] 非推奨チェック失敗:", e)
    }
}

// save
api.addEventListener("graphChanged", () => {
    const workflow = app.extensionManager.workflow
    const openedWorkflows = workflow.workflows
        .filter(i => i.isLoaded)
        .sort((a, b) => b.lastModified - a.lastModified)
        .map(workflow => {
            return {
                path: workflow.path,
                workflow: workflow.activeState,
                initial: workflow.initialState,
                lastModified: workflow.lastModified,
                size: workflow.size,
                isTemporary: workflow.isTemporary,
            }
        })
    const json = JSON.stringify(openedWorkflows)
    localStorage.setItem('keep-multiple-tabs-workflows', json)
})

// load
const workflowStore = app.extensionManager.workflow
const openOrig = workflowStore.openWorkflow

workflowStore.openWorkflow = async function (workflow) {
    workflowStore.openWorkflow = openOrig // once
    const retval = await openOrig.call(this, workflow)

    const lookup = {}
    app.extensionManager.workflow.workflows.forEach(workflow => {
        lookup[workflow.path] = workflow
    })

    try {
        const json = localStorage.getItem('keep-multiple-tabs-workflows')
        const workflows = JSON.parse(json)

        const openedWorkflows = workflows
            .filter(i => i.path !== workflow.path)
            .sort((a, b) => b.lastModified - a.lastModified)
        const activeWorkflow = workflowStore.activeWorkflow

        for (const {path, workflow, initial, lastModified, size, isTemporary} of openedWorkflows) {
            if (lookup[path]) {
                const comfyWorkflow = lookup[path]
                await comfyWorkflow.load()
                comfyWorkflow.content = JSON.stringify(workflow)
                comfyWorkflow.changeTracker.activeState = workflow
                comfyWorkflow.changeTracker.initialState = initial
                await openOrig.call(this, comfyWorkflow, {force: true})
            } else if (isTemporary) {
                const comfyWorkflow = workflowStore.createTemporary(path, workflow)
                await openOrig.call(this, comfyWorkflow, {force: true})
            } else {
                // unknown workflow type
                console.error("[keep-multiple-tabs] skip: Unknown workflow type", path)
            }
        }

        workflowStore.activeWorkflow = activeWorkflow
    } catch(e) {
        console.warn("[keep-multiple-tabs]: load failed", e)
    }

    // 非推奨通知チェック（ワークフロー読み込み完了後に実行）
    checkAndNotifyDeprecation()

    return retval
}
