console.log("Hello, world!");

process.stdin.setRawMode(true);

process.stdin.on("data", (data: Buffer) => {
    if (data.toString() === "\x03") process.exit(); // Ctrl+C = exit
    console.log("key:", JSON.stringify(data));
});

