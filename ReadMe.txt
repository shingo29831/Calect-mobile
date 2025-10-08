cd C:\dev\calect
cd C:\dev\calect-mobile


リスト表示
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds


エミュレータ起動
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_6a_API_35

& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_36.0


Metro開発サーバー起動
npx react-native start --reset-cache


ビルドしてアプリ起動
npx react-native run-android


リリースアプリ作成
cd android
.\gradlew assembleRelease