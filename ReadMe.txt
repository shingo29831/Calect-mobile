cd C:\dev\calect


エミュレータ起動
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_6a_API_35


Metro開発サーバー起動
npx react-native start --reset-cache


ビルドしてアプリ起動
npx react-native run-android
