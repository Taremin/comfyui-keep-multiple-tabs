import { app } from "../../scripts/app.js"
import { api } from "../../scripts/api.js"

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

    return retval
}
