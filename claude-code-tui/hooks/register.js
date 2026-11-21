import { renderAgents } from './agents-view.js';
import { renderDashboard, renderSidebar } from './dashboard-view.js';
import { basename, joinPath, } from './utils.js';
const PANE_ID = 'workspace-dashboard';
const COMMAND_NAME = 'inspector';
export function register(on) {
    let activeTab = 'dashboard';
    let agentSubview = 'active';
    let currentDirectory = '';
    let workspaces = [];
    let selectedWorkspace = '';
    let searchOpen = false;
    let searchValue = '';
    let agentSearch = '';
    let selectedAgentId = '';
    let agentPrompt = '';
    let sessionAgents = [];
    let agentError = '';
    let loadingAgents = false;
    let launchingAgent = false;
    let dashboardError = '';
    let contextSnapshots = [];
    on('session.start', async ($, event, next) => {
        await $.command.register({
            name: COMMAND_NAME,
            description: 'Open the workspace and agents inspector pane',
        });
        currentDirectory = event.cwd ?? '';
        const configuredRoot = await $.env.get('CLAUDE_CODE_WORKSPACES_DIR');
        const home = await $.env.get('HOME');
        const root = configuredRoot?.trim() || (home ? joinPath(home, 'programming') : currentDirectory);
        try {
            const entries = await $.fs.list(root);
            workspaces = entries
                .filter((entry) => entry.kind === 'directory' && !entry.isLink && !entry.name.startsWith('.'))
                .map((entry) => ({ name: entry.name, path: joinPath(root, entry.name) }));
            if (!workspaces.some((workspace) => workspace.path === currentDirectory)) {
                workspaces.unshift({ name: basename(currentDirectory), path: currentDirectory });
            }
            workspaces.sort((left, right) => left.name.localeCompare(right.name));
        }
        catch {
            workspaces = [{ name: basename(currentDirectory), path: currentDirectory }];
        }
        selectedWorkspace = workspaces.some((workspace) => workspace.path === currentDirectory)
            ? currentDirectory
            : workspaces[0]?.path ?? currentDirectory;
        return next?.(event);
    });
    on('command.run', { command: COMMAND_NAME }, ($) => $.ui
        .open({ id: PANE_ID, title: 'Claude Code', focus: true, closeOnEscape: true })
        .then(() => ({}))
        .catch(() => ({ text: 'Could not open Workspace Dashboard.' })));
    on('ui.render', { component: 'Pane' }, async ($, event, next) => {
        if (event.requestId !== PANE_ID)
            return next?.(event);
        const ui = $.ui.resolve(event);
        const redraw = () => $.ui.invalidate('ui.render');
        const refreshDashboardContext = async () => {
            dashboardError = '';
            const [agentResult, contextResult] = await Promise.allSettled([
                $.agent.list(),
                $.command.run({ command: 'context' }),
            ]);
            if (agentResult.status === 'fulfilled')
                sessionAgents = agentResult.value;
            else
                dashboardError = 'Could not load subagent token statistics.';
            if (contextResult.status === 'fulfilled' && contextResult.value.text?.trim()) {
                contextSnapshots = [
                    ...contextSnapshots,
                    { capturedAt: new Date().toLocaleTimeString(), text: contextResult.value.text.trim() },
                ].slice(-3);
            }
            else if (contextResult.status === 'rejected') {
                dashboardError = dashboardError || 'Could not capture the current context snapshot.';
            }
            else {
                dashboardError = dashboardError || 'Claude Code did not return a context snapshot.';
            }
            redraw();
        };
        const refreshAgents = async () => {
            loadingAgents = true;
            agentError = '';
            redraw();
            try {
                sessionAgents = await $.agent.list();
            }
            catch {
                sessionAgents = [];
                agentError = 'Could not load agents for this Claude Code session.';
            }
            finally {
                loadingAgents = false;
                redraw();
            }
        };
        const selected = workspaces.find((workspace) => workspace.path === selectedWorkspace) ?? {
            name: basename(currentDirectory),
            path: currentDirectory,
        };
        const sidebar = renderSidebar(ui, {
            activeTab,
            workspaces,
            selectedWorkspace,
            searchOpen,
            searchValue,
            redraw,
            onNewConversation: async () => {
                try {
                    await $.command.run({ command: 'clear' });
                }
                catch {
                    await $.ui.toast('Could not start a fresh conversation in this workspace.');
                }
            },
            onSearchOpen: () => {
                searchOpen = true;
                redraw();
            },
            onSearchInput: (value) => {
                searchValue = value;
                redraw();
            },
            onSearchSubmit: (value) => {
                searchValue = value;
                searchOpen = false;
                redraw();
            },
            onWorkspaceSelect: (workspace) => {
                selectedWorkspace = workspace.path;
                activeTab = 'dashboard';
                redraw();
            },
            onTabSelect: async (tab) => {
                activeTab = tab;
                if (tab === 'agents') {
                    agentSubview = 'active';
                    await refreshAgents();
                }
                redraw();
            },
        });
        const dashboard = renderDashboard(ui, {
            selected,
            sessionAgents,
            contextSnapshots,
            dashboardError,
            onRefreshContext: refreshDashboardContext,
        });
        const agents = renderAgents(ui, {
            agentSubview,
            agentSearch,
            agentPrompt,
            sessionAgents,
            selectedAgentId,
            selectedWorkspace: selected,
            agentError,
            loadingAgents,
            launchingAgent,
            redraw,
            onSubviewChange: (subview) => {
                agentSubview = subview;
                if (subview === 'active' || subview === 'inactive')
                    agentSearch = '';
            },
            onAgentSearchInput: (value) => {
                agentSearch = value;
                redraw();
            },
            onAgentSearchSubmit: (value) => {
                agentSearch = value;
                redraw();
            },
            onRefreshAgents: refreshAgents,
            onSelectAgent: (agentId) => {
                selectedAgentId = agentId;
                agentSubview = 'detail';
                redraw();
            },
            onAgentPromptInput: (value) => {
                agentPrompt = value;
            },
            onAgentPromptSubmit: async (value) => {
                const task = value.trim();
                if (!task || launchingAgent)
                    return;
                launchingAgent = true;
                redraw();
                try {
                    const result = await $.agent.spawn({
                        prompt: task,
                        description: task.length > 64 ? `${task.slice(0, 61)}…` : task,
                        cwd: selected.path,
                    });
                    if (result.deny) {
                        await $.ui.toast(`Could not start agent: ${result.deny}`);
                        return;
                    }
                    agentPrompt = '';
                    agentSubview = 'active';
                    await refreshAgents();
                    await $.ui.toast(`Agent started in ${selected.name}.`);
                }
                catch {
                    await $.ui.toast(`Could not start an agent in ${selected.name}.`);
                }
                finally {
                    launchingAgent = false;
                    redraw();
                }
            },
        });
        return ui.Box({
            flexDirection: 'row',
            flexGrow: 1,
            columnGap: 1,
            children: [sidebar, activeTab === 'dashboard' ? dashboard : agents],
        });
    });
}
