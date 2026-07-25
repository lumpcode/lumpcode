/**
 * Minimal Windows npm-cmd-shim `.cmd` body (modern `"%_prog%"` + `"%dp0%\\…\\.js" %*` form).
 * Shared by core spawn tests and CLI e2e path-agent install — do not duplicate.
 */
export function windowsNpmCmdShimBody(relativeJsFromShimDir: string): string {
    const target = relativeJsFromShimDir.replace(/\//g, '\\');
    return [
        '@ECHO off',
        'GOTO start',
        ':find_dp0',
        'SET dp0=%~dp0',
        'EXIT /b',
        ':start',
        'SETLOCAL',
        'CALL :find_dp0',
        '',
        'IF EXIST "%dp0%\\node.exe" (',
        '  SET "_prog=%dp0%\\node.exe"',
        ') ELSE (',
        '  SET "_prog=node"',
        '  SET PATHEXT=%PATHEXT:;.JS;=;%',
        ')',
        '',
        `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\${target}" %*`,
        '',
    ].join('\r\n');
}
