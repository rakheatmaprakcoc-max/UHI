@echo off
echo ============================================================
echo  Re-encode COG files: Float64+Predictor2  ->  Float32+Predictor3
echo  Float32 is sufficient for temperature data (0.00001 degree C precision)
echo  Predictor 3 is the correct floating-point horizontal differencing predictor
echo ============================================================
echo.

where gdal_translate >nul 2>&1
if errorlevel 1 (
    echo ERROR: gdal_translate not found in PATH.
    echo Install OSGeo4W or add GDAL bin folder to your PATH, then re-run.
    pause
    exit /b 1
)

cd /d "%~dp0Data"

for %%F in (*_cog.tif) do (
    echo Processing: %%F
    gdal_translate ^
        -of COG ^
        -ot Float32 ^
        -co COMPRESS=DEFLATE ^
        -co PREDICTOR=3 ^
        -co OVERVIEW_RESAMPLING=AVERAGE ^
        -co BIGTIFF=IF_NEEDED ^
        "%%F" "__tmp_%%F"
    if errorlevel 1 (
        echo   FAILED - original file kept unchanged.
        if exist "__tmp_%%F" del "__tmp_%%F"
    ) else (
        del "%%F"
        if exist "%%F.aux.xml" del "%%F.aux.xml"
        ren "__tmp_%%F" "%%F"
        echo   OK
    )
    echo.
)

echo ============================================================
echo  Done.  Reload the webapp and try the COG layers again.
echo ============================================================
pause
