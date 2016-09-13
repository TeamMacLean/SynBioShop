#!/usr/bin/env bash
for file in $(find . -name "*.js"); do
if [[ $file != *"public/"* ]] && [[ $file != *"node_modules/"* ]]; then
echo $file
    lebab $file -o $file --transform arrow,for-of,arg-spread,obj-method,obj-shorthand,no-strict,exponent
fi
done