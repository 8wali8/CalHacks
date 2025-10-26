if not contains "$HOME/calhacks/analytics-lab/.uv" $PATH
    # Prepending path in case a system-installed binary needs to be overridden
    set -x PATH "$HOME/calhacks/analytics-lab/.uv" $PATH
end
