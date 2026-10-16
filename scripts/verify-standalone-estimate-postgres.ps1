$ErrorActionPreference='Stop'
# Run from the repository root on Windows. Dependencies stay under ignored .temp:
# npm install --prefix .temp/postgres-runtime --no-save --package-lock=false @embedded-postgres/windows-x64@17.10.0-beta.17 pg@8.16.3
# npm install --prefix .temp/standalone-checks --no-save --package-lock=false @electric-sql/pglite@0.5.9
$bin=Join-Path $PWD '.temp/postgres-runtime/node_modules/@embedded-postgres/windows-x64/native/bin'
if (!(Test-Path "$bin/postgres.exe")) { throw 'Install the pinned fixture dependencies documented above.' }
if (Get-NetTCPConnection -LocalPort 55439 -State Listen -ErrorAction SilentlyContinue) { throw 'Fixture loopback port 55439 is already occupied.' }
$data=Join-Path $PWD ('.temp/postgres-fixture-'+[guid]::NewGuid().ToString('N'))
& "$bin/initdb.exe" -D $data -U postgres -A trust --encoding=UTF8 --no-locale
if ($LASTEXITCODE -ne 0) { throw 'Fixture initdb failed.' }
$server=Start-Process -FilePath "$bin/postgres.exe" -ArgumentList @('-D',$data,'-h','127.0.0.1','-p','55439','-c','max_connections=10') -WindowStyle Hidden -PassThru -RedirectStandardOutput ($data+'-out.log') -RedirectStandardError ($data+'-error.log')
$previous=$env:STANDALONE_LOCAL_POSTGRES
try {
 $env:STANDALONE_LOCAL_POSTGRES='1'
 node scripts/verify-standalone-estimate-db.mjs
 if ($LASTEXITCODE -ne 0) { throw 'Standalone PostgreSQL fixture failed.' }
} finally {
 $env:STANDALONE_LOCAL_POSTGRES=$previous
 & "$bin/pg_ctl.exe" -D $data -m fast -w stop
}
