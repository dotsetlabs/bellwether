#!/bin/bash
# Bash completion for bellwether CLI
# Install: source this file or copy to /etc/bash_completion.d/bellwether

_bellwether_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="check explore discover watch init auth baseline golden registry contract validate-config help --version --help"

    # Global options
    local global_opts="--log-level --log-file --help --version"

    # Command-specific completions
    case "${COMP_WORDS[1]}" in
        check)
            opts="--config --fail-on-drift --accept-drift --accept-reason --format --min-severity --fail-on-severity --help"
            ;;
        explore)
            opts="--config --preset --help"
            ;;
        init)
            opts="--force --preset --provider --yes --help"
            ;;
        baseline)
            opts="save compare show diff accept --help"
            ;;
        auth)
            opts="add remove status --help"
            ;;
        discover)
            opts="--config --json --timeout --transport --url --sessionId --help"
            ;;
        watch)
            opts="--config --help"
            ;;
        registry)
            opts="--limit --json --help"
            ;;
        contract)
            opts="validate generate show --help"
            ;;
        *)
            opts=""
            ;;
    esac

    # Complete based on position
    if [ $COMP_CWORD -eq 1 ]; then
        COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
    elif [[ ${cur} == -* ]]; then
        COMPREPLY=( $(compgen -W "${global_opts} ${opts}" -- ${cur}) )
    fi

    return 0
}

complete -F _bellwether_completions bellwether
