#!/bin/bash
./node_modules/.bin/grpc_tools_node_protoc \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=src/proto \
  --ts_proto_opt=returnObservable=true \
  --proto_path=proto proto/*.proto

# Fix Rpc interface for clientStreamingRequest to return Observable instead of Promise
# This is needed because returnObservable=true makes the implementation expect an Observable
sed -i 's/clientStreamingRequest(service: string, method: string, data: Observable<Uint8Array>): Promise<Uint8Array>;/clientStreamingRequest(service: string, method: string, data: Observable<Uint8Array>): Observable<Uint8Array>;/g' src/proto/grpc.ts
