// Supply-chain view of a Claude Code session: every hook command and MCP server
// that runs code on this machine, and whether that code is pinned to a fixed
// version or fetched fresh (and so can change without notice).
// Pure: no engine calls, so it is unit-tested directly.
import { capped, SETTINGS_SOURCES, table } from './access.js';
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => (typeof value === 'string' ? value : '');
const EXACT_SEMVER = /^v?\d+\.\d+\.\d+([-+][0-9A-Za-z.+-]+)?$/;
const SEVERITY = { unpinned: 4, remote: 3, pinned: 2, local: 1, unknown: 0 };
/** Splits a command into words, honoring quotes (also inside a word: `FOO="a b"`). */
function tokenize(command) {
    const tokens = [];
    let current = '';
    let started = false;
    let quote = '';
    for (let index = 0; index < command.length; index += 1) {
        const char = command[index];
        if (quote) {
            if (char === quote)
                quote = '';
            else if (quote === '"' && char === '\\' && command[index + 1] === '"') {
                current += '"';
                index += 1;
            }
            else
                current += char;
        }
        else if (char === '"' || char === "'") {
            quote = char;
            started = true;
        }
        else if (/\s/.test(char)) {
            if (started)
                tokens.push(current);
            current = '';
            started = false;
        }
        else {
            current += char;
            started = true;
        }
    }
    if (started)
        tokens.push(current);
    return tokens;
}
const baseName = (token) => (token.split(/[\\/]/).pop() ?? token).toLowerCase().replace(/\.(cmd|exe|bat)$/, '');
const isUrl = (token) => /^https?:\/\//i.test(token);
const isPath = (token) => /^(\.{1,2}[\\/]|[\\/]|~|\$|[A-Za-z]:[\\/])/.test(token);
/** First positional word, skipping flags; `valueFlags` consume the word after them. */
function firstPositional(tokens, valueFlags) {
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === '--')
            return tokens[index + 1];
        if (valueFlags.has(token)) {
            index += 1;
            continue;
        }
        if (token.startsWith('-'))
            continue;
        return token;
    }
    return undefined;
}
function flagValue(tokens, names) {
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        for (const name of names) {
            if (token === name)
                return tokens[index + 1];
            if (token.startsWith(`${name}=`))
                return token.slice(name.length + 1);
        }
    }
    return undefined;
}
function classifyNpmSpec(spec) {
    if (isUrl(spec))
        return { pin: 'remote', reason: 'installs from a URL' };
    if (isPath(spec) || spec.startsWith('file:'))
        return { pin: 'local', reason: 'runs a local package' };
    if (/^(git\+|github:|git:)/.test(spec)) {
        return /#[0-9a-f]{7,40}$/i.test(spec)
            ? { pin: 'pinned', reason: 'git commit' }
            : { pin: 'unpinned', reason: 'git source without a commit' };
    }
    const at = spec.lastIndexOf('@');
    if (at <= 0)
        return { pin: 'unpinned', reason: 'no version, so the latest release runs' };
    const version = spec.slice(at + 1);
    if (EXACT_SEMVER.test(version))
        return { pin: 'pinned', reason: `exact version ${version}` };
    return { pin: 'unpinned', reason: `@${version} is not an exact version` };
}
function classifyPythonSpec(spec) {
    if (isUrl(spec))
        return { pin: 'remote', reason: 'installs from a URL' };
    if (isPath(spec))
        return { pin: 'local', reason: 'runs a local package' };
    if (/^git\+/.test(spec)) {
        return /@[0-9a-f]{7,40}$/i.test(spec)
            ? { pin: 'pinned', reason: 'git commit' }
            : { pin: 'unpinned', reason: 'git source without a commit' };
    }
    const exact = /==\s*(\d[\w.+-]*)$/.exec(spec);
    if (exact && !exact[1].includes('*'))
        return { pin: 'pinned', reason: `exact version ${exact[1]}` };
    const at = spec.lastIndexOf('@');
    if (at > 0) {
        const version = spec.slice(at + 1);
        if (EXACT_SEMVER.test(version) || /^\d[\w.+-]*$/.test(version))
            return { pin: 'pinned', reason: `exact version ${version}` };
        return { pin: 'unpinned', reason: `@${version} is not an exact version` };
    }
    return { pin: 'unpinned', reason: 'no exact version, so the latest release runs' };
}
const DOCKER_VALUE_FLAGS = new Set([
    '-e', '--env', '--env-file', '-v', '--volume', '--mount', '-p', '--publish', '--name', '--network', '--net',
    '-w', '--workdir', '-u', '--user', '--entrypoint', '-l', '--label', '--platform', '--add-host', '--cap-add',
    '--cap-drop', '--memory', '-m', '--cpus', '--hostname', '-h', '--pull', '--restart', '--security-opt', '--tmpfs',
]);
function classifyImage(image) {
    if (/@sha256:[0-9a-f]+/i.test(image))
        return { pin: 'pinned', reason: 'image digest' };
    const tail = image.slice(image.lastIndexOf('/') + 1);
    const colon = tail.indexOf(':');
    if (colon < 0)
        return { pin: 'unpinned', reason: 'image has no tag, so :latest runs' };
    const tag = tail.slice(colon + 1);
    if (tag === 'latest')
        return { pin: 'unpinned', reason: 'image tag :latest can change' };
    return { pin: 'pinned', reason: `image tag :${tag}` };
}
const NPM_VALUE_FLAGS = new Set(['-c', '--call', '--registry', '--cache', '--prefix', '--workspace', '-w', '--node-options']);
const PYTHON_VALUE_FLAGS = new Set(['--from', '--spec', '-p', '--python', '--with', '--with-requirements', '--index', '--index-url', '-i', '--extra-index-url', '--env-file', '--directory']);
const WRAPPER_VALUE_FLAGS = {
    sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '--user', '--group', '--host', '--prompt', '--chdir']),
    env: new Set(['-u', '-C', '--unset', '--chdir']),
    exec: new Set(['-a']),
};
const WRAPPERS = new Set(['sudo', 'env', 'exec', 'command', 'time', 'nohup']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'pwsh', 'powershell', 'cmd']);
const INTERPRETERS = new Set(['node', 'deno', 'bun', 'python', 'python3', 'ruby', ...SHELLS]);
const MAX_DEPTH = 5;
/** The command string a shell is told to run (`bash -c STR`, `cmd /c STR...`), if any. */
function shellInline(shell, rest) {
    if (shell === 'cmd') {
        const at = rest.findIndex((token) => /^\/[ckr]$/i.test(token));
        return at >= 0 ? rest.slice(at + 1).join(' ') : undefined;
    }
    if (shell === 'pwsh' || shell === 'powershell') {
        const at = rest.findIndex((token) => /^-(c|command|commandwithargs)$/i.test(token));
        return at >= 0 ? rest.slice(at + 1).join(' ') : undefined;
    }
    const at = rest.findIndex((token) => /^-[A-Za-z]*c[A-Za-z]*$/.test(token));
    return at >= 0 ? rest[at + 1] : undefined;
}
/** Drops env assignments and wrapper commands (with their flags) in front of the real command. */
function stripWrappers(tokens) {
    let index = 0;
    while (index < tokens.length) {
        if (/^[A-Za-z_]\w*=/.test(tokens[index])) {
            index += 1;
            continue;
        }
        const wrapper = baseName(tokens[index]);
        if (!WRAPPERS.has(wrapper))
            break;
        index += 1;
        const valueFlags = WRAPPER_VALUE_FLAGS[wrapper];
        while (index < tokens.length && tokens[index].startsWith('-')) {
            const flag = tokens[index];
            index += 1;
            if (flag === '--')
                break;
            if (valueFlags?.has(flag))
                index += 1;
        }
    }
    return tokens.slice(index);
}
function classifySegment(rawTokens, depth = 0) {
    const tokens = stripWrappers(rawTokens);
    if (tokens.length === 0)
        return { pin: 'local', reason: 'no command' };
    const head = baseName(tokens[0]);
    const rest = tokens.slice(1);
    if (SHELLS.has(head) && depth < MAX_DEPTH) {
        const inline = shellInline(head, rest);
        if (inline)
            return classifyShellString(inline, depth + 1);
    }
    if (isUrl(tokens[0]))
        return { pin: 'remote', reason: 'a URL' };
    const npmRunner = head === 'npx' || head === 'bunx'
        || (head === 'npm' && (rest[0] === 'exec' || rest[0] === 'x'))
        || ((head === 'pnpm' || head === 'yarn') && rest[0] === 'dlx');
    if (npmRunner) {
        const args = head === 'npx' || head === 'bunx' ? rest : rest.slice(1);
        const spec = flagValue(args, ['-p', '--package']) ?? firstPositional(args, NPM_VALUE_FLAGS);
        if (!spec)
            return { pin: 'unpinned', reason: 'no package named' };
        return classifyNpmSpec(spec);
    }
    const pythonRunner = head === 'uvx' || (head === 'pipx' && rest[0] === 'run') || (head === 'uv' && rest[0] === 'tool' && rest[1] === 'run');
    if (pythonRunner) {
        const args = head === 'uvx' ? rest : head === 'pipx' ? rest.slice(1) : rest.slice(2);
        const spec = flagValue(args, ['--from', '--spec']) ?? firstPositional(args, PYTHON_VALUE_FLAGS);
        if (!spec)
            return { pin: 'unpinned', reason: 'no package named' };
        return classifyPythonSpec(spec);
    }
    if ((head === 'docker' || head === 'podman') && rest[0] === 'run') {
        const image = firstPositional(rest.slice(1), DOCKER_VALUE_FLAGS);
        if (!image)
            return { pin: 'unpinned', reason: 'no image named' };
        return classifyImage(image);
    }
    if (tokens.some(isUrl))
        return { pin: 'remote', reason: 'talks to a URL' };
    if (isPath(tokens[0]))
        return { pin: 'local', reason: 'a local path' };
    if (INTERPRETERS.has(head))
        return { pin: 'local', reason: 'a local script' };
    return { pin: 'local', reason: `runs ${head} from this machine` };
}
/** Index of the parenthesis closing the one at `open`, or the end of the string. */
function closingParen(input, open) {
    let level = 0;
    for (let index = open; index < input.length; index += 1) {
        if (input[index] === '(')
            level += 1;
        else if (input[index] === ')' && (level -= 1) === 0)
            return index;
    }
    return input.length;
}
/**
 * Splits shell text into the commands it runs: separators (`&&`, `||`, `;`, `|`, `&`,
 * newlines, parentheses) outside quotes, and the insides of `$(...)`, `<(...)` and
 * backticks (outside single quotes), which are returned as commands of their own.
 */
function splitShell(input, out = [], depth = 0) {
    let current = '';
    let quote = '';
    const flush = () => {
        if (current.trim())
            out.push(current.trim());
        current = '';
    };
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quote === "'") {
            current += char;
            if (char === "'")
                quote = '';
            continue;
        }
        if (char === '`') {
            const end = input.indexOf('`', index + 1);
            const stop = end < 0 ? input.length : end;
            if (depth < MAX_DEPTH)
                splitShell(input.slice(index + 1, stop), out, depth + 1);
            current += '$SUBST';
            index = stop;
            continue;
        }
        if ((char === '$' || char === '<' || char === '>') && input[index + 1] === '(') {
            const close = closingParen(input, index + 1);
            if (depth < MAX_DEPTH)
                splitShell(input.slice(index + 2, close), out, depth + 1);
            current += '$SUBST';
            index = close;
            continue;
        }
        if (quote === '"') {
            current += char;
            if (char === '"')
                quote = '';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (char === '&' || char === ';' || char === '|' || char === '\n' || char === '(' || char === ')') {
            flush();
            continue;
        }
        current += char;
    }
    flush();
    return out;
}
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}']);
const DOWNLOADER = '(?:curl|wget|fetch|iwr|irm|invoke-webrequest|invoke-restmethod)';
const SHELLISH = '(?:(?:ba|z|da|k|c|fi|a)?sh|pwsh|powershell|python[\\d.]*|node|deno|bun|ruby|perl|php|iex|eval)';
const LAUNCHER = '(?:(?:sudo|env|exec|command|nohup)\\s+(?:-\\S+\\s+|\\w+=\\S*\\s+)*)*';
const DOWNLOAD_PIPES = [
    // curl URL | sh, | bash -s, | /bin/sh, | sudo -E bash, | env bash, | python, | node
    new RegExp(`\\b${DOWNLOADER}\\b[^;&\\n]*\\|\\s*${LAUNCHER}(?:\\S*[\\\\/])?${SHELLISH}\\b`, 'i'),
    // bash <(curl URL), sh -c "$(curl URL)", eval `curl URL`
    new RegExp(`\\b${SHELLISH}\\b[^;&|\\n]*(?:<\\(|\\$\\(|\`)\\s*${DOWNLOADER}\\b`, 'i'),
];
/** True when text downloads something and feeds it to a shell or interpreter. */
function pipesDownloadIntoShell(text) {
    return DOWNLOAD_PIPES.some((pattern) => pattern.test(text));
}
/** Classifies one shell string: the worst of its segments. */
function classifyShellString(command, depth) {
    const segments = splitShell(command).map((part) => {
        const tokens = tokenize(part);
        let start = 0;
        while (start < tokens.length && SHELL_KEYWORDS.has(tokens[start]))
            start += 1;
        return tokens.slice(start);
    }).filter((tokens) => tokens.length > 0);
    let worst = { pin: 'local', reason: 'no command' };
    for (const tokens of segments) {
        const result = classifySegment(tokens, depth);
        if (SEVERITY[result.pin] > SEVERITY[worst.pin] || worst.reason === 'no command')
            worst = result;
    }
    return worst;
}
/**
 * Says whether a command pins the code it runs. `args` is the separate argument
 * list of an MCP server; a hook passes its whole shell string as `command`.
 */
export function classifyCommand(command, args = []) {
    try {
        if (pipesDownloadIntoShell([command, ...args].join(' '))) {
            return { pin: 'unpinned', reason: 'pipes a download into a shell' };
        }
        // An MCP server spawns `command` as a single argv[0]: never split it on spaces.
        if (args.length > 0)
            return classifySegment([command, ...args]);
        return classifyShellString(command, 0);
    }
    catch {
        return { pin: 'unknown', reason: 'could not parse the command' };
    }
}
function describeMarketplace(entry) {
    const source = record(record(entry).source);
    const kind = text(source.source);
    if (!kind)
        return undefined;
    const where = text(source.repo) || text(source.url) || text(source.path);
    return where ? `${kind} ${where}` : kind;
}
function readMcpServers(servers, origin) {
    return Object.entries(record(servers)).map(([name, raw]) => {
        const config = record(raw);
        const url = text(config.url);
        const command = text(config.command);
        const args = Array.isArray(config.args) ? config.args.filter((arg) => typeof arg === 'string') : [];
        const transport = text(config.type) || (url ? 'http' : 'stdio');
        if (url && !command) {
            return { name, transport, command: url, origin, pin: 'remote', reason: 'remote server, its code can change on its side' };
        }
        const result = command ? classifyCommand(command, args) : { pin: 'unknown', reason: 'no command in the config' };
        return { name, transport, command: [command, ...args].join(' ').trim(), origin, pin: result.pin, reason: result.reason };
    });
}
const normalize = (name) => name.replace(/[^A-Za-z0-9]/g, '_').toLowerCase();
export function analyzeSupplyChain(input) {
    const hooks = [];
    const mcpServers = [];
    const pluginMap = new Map();
    const marketplaces = new Map();
    for (const source of SETTINGS_SOURCES) {
        if (!(source in input.settings))
            continue;
        const settings = record(input.settings[source]);
        for (const [event, matchers] of Object.entries(record(settings.hooks))) {
            if (!Array.isArray(matchers))
                continue;
            for (const group of matchers) {
                const matcher = text(record(group).matcher);
                const inner = record(group).hooks;
                for (const hook of Array.isArray(inner) ? inner : []) {
                    const entry = record(hook);
                    const type = text(entry.type) || 'command';
                    if (type === 'http' && text(entry.url)) {
                        hooks.push({ event, matcher, command: text(entry.url), source, pin: 'remote', reason: 'posts to a URL' });
                        continue;
                    }
                    const command = text(entry.command);
                    if (type !== 'command' || !command)
                        continue;
                    hooks.push({ event, matcher, command, source, ...classifyCommand(command) });
                }
            }
        }
        mcpServers.push(...readMcpServers(settings.mcpServers, `${source} settings`));
        for (const [name, entry] of Object.entries(record(settings.extraKnownMarketplaces))) {
            const described = describeMarketplace(entry);
            if (described)
                marketplaces.set(name, described);
        }
        for (const [name, enabled] of Object.entries(record(settings.enabledPlugins))) {
            if (typeof enabled === 'boolean')
                pluginMap.set(name, { name, enabled });
        }
    }
    for (const file of input.mcpFiles ?? []) {
        const content = record(file.content);
        mcpServers.push(...readMcpServers(content.mcpServers ?? content, file.origin));
    }
    const known = new Set(mcpServers.map((server) => normalize(server.name)));
    for (const server of input.toolServers) {
        if (known.has(normalize(server)))
            continue;
        known.add(normalize(server));
        mcpServers.push({
            name: server, transport: 'unknown', command: '',
            origin: 'plugin or connector (config not readable)', pin: 'unknown', reason: 'its command could not be read',
        });
    }
    const plugins = [...pluginMap.values()].map((plugin) => {
        const at = plugin.name.lastIndexOf('@');
        const marketplace = at > 0 ? plugin.name.slice(at + 1) : undefined;
        return { ...plugin, marketplace, marketplaceSource: marketplace ? marketplaces.get(marketplace) : undefined };
    }).sort((left, right) => Number(right.enabled) - Number(left.enabled) || left.name.localeCompare(right.name));
    const unpinned = [...hooks, ...mcpServers].filter((entry) => entry.pin === 'unpinned').length;
    return { hooks, mcpServers, plugins, unpinned, unreadable: input.unreadable };
}
const PIN_LABELS = {
    unpinned: '⚠ unpinned',
    pinned: '● pinned',
    local: '○ local',
    remote: '↗ remote',
    unknown: '? unknown',
};
const clip = (value, limit = 70) => (value.length > limit ? `${value.slice(0, limit - 1)}…` : value);
/** The supply-chain report as Markdown, for `/cognita supply`. */
export function formatSupplyChain(report) {
    const hooks = capped(report.hooks, 30);
    const servers = capped(report.mcpServers, 30);
    const plugins = capped(report.plugins, 30);
    const marketplaces = new Set(report.plugins.map((plugin) => plugin.marketplace).filter(Boolean));
    const lines = [
        '## What code runs on your machine',
        '',
        report.unpinned > 0
            ? `**${report.unpinned} unpinned command(s) download code that can change without notice.**`
            : 'No unpinned commands found.',
        '',
        `${report.hooks.length} hook command(s) · ${report.mcpServers.length} MCP server(s) · ${report.plugins.length} plugin(s) from ${marketplaces.size} marketplace(s)`,
        '',
        '### Hooks',
        '',
        ...table(['Event', 'Matcher', 'Command', 'Source', 'Pinned?'], hooks.shown.map((hook) => [hook.event, hook.matcher, `\`${clip(hook.command)}\``, hook.source, `${PIN_LABELS[hook.pin]}: ${hook.reason}`])),
        ...(hooks.rest > 0 ? ['', `…and ${hooks.rest} more hook(s).`] : []),
        '',
        '### MCP servers',
        '',
        ...table(['Server', 'Transport', 'Command or URL', 'Origin', 'Pinned?'], servers.shown.map((server) => [server.name, server.transport, server.command ? `\`${clip(server.command)}\`` : '', server.origin, `${PIN_LABELS[server.pin]}: ${server.reason}`])),
        ...(servers.rest > 0 ? ['', `…and ${servers.rest} more server(s).`] : []),
        '',
        '### Plugins and their marketplaces',
        '',
        ...table(['Plugin', 'State', 'Marketplace', 'Marketplace source'], plugins.shown.map((plugin) => [plugin.name, plugin.enabled ? 'enabled' : 'disabled', plugin.marketplace ?? '', plugin.marketplaceSource ?? 'not declared in settings'])),
        ...(plugins.rest > 0 ? ['', `…and ${plugins.rest} more plugin(s).`] : []),
        ...(report.unreadable.length > 0
            ? ['', '### Could not read', '', ...report.unreadable.map((item) => `- ${item}`)]
            : []),
        '',
        '_Pinned means an exact version or digest. Unpinned commands fetch whatever is newest each time they start. Nothing was run or changed._',
    ];
    return lines.join('\n');
}
export function formatSupplyChainJson(report) {
    return JSON.stringify(report, null, 2);
}
