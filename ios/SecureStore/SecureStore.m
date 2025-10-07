// ios/SecureStore/SecureStore.m
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SecureStore, NSObject)

RCT_EXTERN_METHOD(setItem:(NSString *)service
                  account:(NSString *)account
                  valueB64:(NSString *)valueB64
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getItem:(NSString *)service
                  account:(NSString *)account
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteItem:(NSString *)service
                  account:(NSString *)account
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup { return NO; }
@end
