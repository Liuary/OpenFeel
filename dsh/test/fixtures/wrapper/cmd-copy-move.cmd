@echo off
rem A67 fixture：cmd 语义 —— copy/move 只把**目标**算写（源只被读 → allow）
copy src\generated.ts dist\out.ts
move src\generated.ts dist\out.ts
