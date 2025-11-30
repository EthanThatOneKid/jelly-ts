#!/bin/bash
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/proto \
  --ts_proto_opt=returnObservable=true \
  --proto_path=proto proto/*.proto
