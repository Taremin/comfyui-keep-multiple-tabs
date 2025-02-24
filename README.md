# comfyui-keep-multiple-tabs

これは [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 用の拡張です。
複数のワークフロータブをリロードや再起動をしたときに失われないように保持します。


## インストール

### ComfyUI

下記の二通りからお好きな方法でインストールしてください。

1. `custom_nodes` にこのリポジトリを clone する
2. `ComfyUI Manager Menu` の `Install via Git URL` にこのリポジトリのURLを入力してインストールする


## 注意

ブラウザの `localStorage` を使用して保持しています。
`keep-multiple-tabs-workflows` にこの拡張で使用するデータが入っているので、不要になってこの拡張の痕跡を消したい場合はこのキーを削除してください。

## ライセンス

[MIT](./LICENSE)
