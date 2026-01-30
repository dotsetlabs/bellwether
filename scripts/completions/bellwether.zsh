#compdef bellwether
# Zsh completion for bellwether CLI
# Install: copy to /usr/local/share/zsh/site-functions/_bellwether

_bellwether() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \
        '(-h --help)'{-h,--help}'[Show help]' \
        '(-v --version)'{-v,--version}'[Show version]' \
        '--log-level[Set log level]:level:(debug info warn error silent)' \
        '--log-file[Write logs to file]:file:_files' \
        '1: :_bellwether_commands' \
        '*:: :->args'

    case "$line[1]" in
        check)
            _arguments \
                '-c[Config file path]:config:_files -g "*.yaml"' \
                '--config[Config file path]:config:_files -g "*.yaml"' \
                '--fail-on-drift[Exit with error if drift detected]' \
                '--accept-drift[Accept drift as intentional]' \
                '--accept-reason[Reason for accepting drift]:reason:' \
                '--format[Output format]:format:(text json compact github markdown junit sarif)' \
                '--min-severity[Minimum severity]:severity:(none info warning breaking)' \
                '--fail-on-severity[Fail threshold]:severity:(none info warning breaking)'
            ;;
        explore)
            _arguments \
                '-c[Config file path]:config:_files -g "*.yaml"' \
                '--config[Config file path]:config:_files -g "*.yaml"' \
                '--preset[Configuration preset]:preset:(ci security thorough local)'
            ;;
        init)
            _arguments \
                '-f[Overwrite existing config]' \
                '--force[Overwrite existing config]' \
                '--preset[Use preset]:preset:(ci security thorough local)' \
                '--provider[LLM provider]:provider:(ollama openai anthropic)' \
                '-y[Skip prompts, use defaults]' \
                '--yes[Skip prompts, use defaults]'
            ;;
        baseline)
            _arguments '1: :_baseline_subcommands'
            ;;
        auth)
            _arguments '1: :_auth_subcommands'
            ;;
        *)
            _files
            ;;
    esac
}

_bellwether_commands() {
    local commands=(
        'check:Schema validation and drift detection'
        'explore:LLM-powered behavioral exploration'
        'discover:Discover MCP server capabilities'
        'watch:Watch for server changes'
        'init:Initialize configuration'
        'auth:Manage API keys'
        'baseline:Manage baselines'
        'golden:Manage golden outputs'
        'registry:Search MCP Registry'
        'contract:Contract validation'
        'validate-config:Validate configuration'
        'help:Show help'
    )
    _describe -t commands 'bellwether commands' commands
}

_baseline_subcommands() {
    local subcommands=(
        'save:Save test results as baseline'
        'compare:Compare against baseline'
        'show:Display baseline contents'
        'diff:Compare two baselines'
        'accept:Accept drift as intentional'
    )
    _describe -t commands 'baseline subcommands' subcommands
}

_auth_subcommands() {
    local subcommands=(
        'add:Add API key'
        'remove:Remove API key'
        'status:Show auth status'
    )
    _describe -t commands 'auth subcommands' subcommands
}

compdef _bellwether bellwether
