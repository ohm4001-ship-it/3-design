# Pure gameplay checks

Run with .NET SDK 10:

```powershell
dotnet run --project Tests/PokeLab.Core.Tests.csproj --configuration Release
```

The harness compiles the same `Assets/Scripts/Core` sources used by Unity. It has no Unity or NuGet dependencies. It checks configuration recovery, collection identity and capacity, capture resource accounting, battle intent, invalid actions, room progression, all three dungeon completions, reward idempotency, and defeated runs.

These checks verify gameplay logic. Unity's Editor and player build must separately verify rendering, input, serialization, scene setup, and platform compatibility.
