export function oauthSuccessHtml(message: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f0fdf4; color: #166534; }
        h1 { margin-bottom: 1rem; }
        p { font-size: 1.2rem; }
    </style>
</head>
<body>
    <h1>Authentication Successful!</h1>
    <p>${message}</p>
    <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>
    `;
}

export function oauthErrorHtml(message: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Authentication Failed</title>
    <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #fef2f2; color: #991b1b; }
        h1 { margin-bottom: 1rem; }
        p { font-size: 1.2rem; }
    </style>
</head>
<body>
    <h1>Authentication Failed</h1>
    <p>${message}</p>
</body>
</html>
    `;
}
