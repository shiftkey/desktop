#!/bin/sh

# Check setting
USERNS_SETTING=$(eval "sysctl -n kernel.unprivileged_userns_clone")

if [ "$USERNS_SETTING" = 1 ]; then
    # Your kernel has the patch to allow unprivileged user namespace
    FLAG=""
elif [ "$USERNS_SETTING" = 0 ]; then
    # Your kernel has unprivileged user namespace disabled
    echo "User namespaces are not detected as enabled on your system, GitHub will run with the sandbox disabled"
    FLAG="--no-sandbox"
else
    # We need a new test
    echo "Unknown user namespace setting; running as normal"
    FLAG=""
fi

# Warn the user if sandboxing will be turned off, otherwise just attempt to run
if [ $FLAG ]; then
    zenity \
    --question \
    --text="<span size=\"xx-large\">Unable to enable sandbox.</span> \
\n\nUser namespaces are not detected as enabled on your system.\n\
Run GitHub Desktop with sandbox <b>disabled</b>?" \
    --icon-name="dialog-warning" \
    --no-wrap \
    --title="GitHub Desktop" \
    --ok-label="Launch" \
    --cancel-label="Cancel"

    if [ $? = 0 ]; then
        exec github-desktop $@ $FLAG
    fi
else 
    exec github-desktop $@
fi
