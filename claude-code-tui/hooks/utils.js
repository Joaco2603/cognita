export function basename(path) {
    return path.split('/').filter(Boolean).at(-1) ?? path;
}
export function joinPath(parent, child) {
    return `${parent.replace(/\/$/, '')}/${child}`;
}
export function formatTokenCount(count) {
    return new Intl.NumberFormat('en-US').format(count);
}
export function isActiveAgent(agent) {
    return agent.taskStatus === 'pending' || agent.taskStatus === 'running' || agent.taskStatus === 'paused';
}
