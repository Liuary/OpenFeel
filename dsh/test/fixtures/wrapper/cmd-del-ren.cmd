@echo off
rem A67 fixture：cmd 语义 —— del/ren 的全部位置参数都算写（含源 → class 2 deny）
del src\generated.ts
ren src\generated.ts generated.bak
