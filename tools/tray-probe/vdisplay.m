// clang -fobjc-arc -framework Foundation -framework CoreGraphics vdisplay.m -o /tmp/vdisplay
// e.g. /tmp/vdisplay 2560 1440 0 2056 0   (non-Retina, right of a 2056-pt-wide laptop screen); kill it to remove the display.
// Creates a virtual display (private CoreGraphics API, as used by DeskPad/BetterDisplay)
// and keeps it alive until the process is killed.
// usage: vdisplay <width> <height> <hiDPI 0|1> <originX> <originY>
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(NSUInteger)width height:(NSUInteger)height refreshRate:(double)refreshRate;
@end
@interface CGVirtualDisplaySettings : NSObject
@property (nonatomic) unsigned int hiDPI;
@property (nonatomic, retain) NSArray *modes;
@end
@class CGVirtualDisplay;
@interface CGVirtualDisplayDescriptor : NSObject
@property (nonatomic, retain) dispatch_queue_t queue;
@property (nonatomic, retain) NSString *name;
@property (nonatomic) unsigned int maxPixelsWide;
@property (nonatomic) unsigned int maxPixelsHigh;
@property (nonatomic) CGSize sizeInMillimeters;
@property (nonatomic) unsigned int productID;
@property (nonatomic) unsigned int vendorID;
@property (nonatomic) unsigned int serialNum;
@property (nonatomic, copy) void (^terminationHandler)(id, CGVirtualDisplay *);
@end
@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor *)descriptor;
- (BOOL)applySettings:(CGVirtualDisplaySettings *)settings;
@property (readonly, nonatomic) CGDirectDisplayID displayID;
@end

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc < 6) { fprintf(stderr, "usage: vdisplay w h hidpi x y\n"); return 2; }
    unsigned w = atoi(argv[1]), h = atoi(argv[2]), hidpi = atoi(argv[3]);
    int ox = atoi(argv[4]), oy = atoi(argv[5]);
    CGVirtualDisplayDescriptor *d = [CGVirtualDisplayDescriptor new];
    d.queue = dispatch_get_main_queue();
    d.name = @"Tray Test Display";
    d.maxPixelsWide = w * (hidpi ? 2 : 1);
    d.maxPixelsHigh = h * (hidpi ? 2 : 1);
    d.sizeInMillimeters = CGSizeMake(597, 336);
    d.productID = 0x7EE7; d.vendorID = 0x3456; d.serialNum = 1;
    CGVirtualDisplay *display = [[CGVirtualDisplay alloc] initWithDescriptor:d];
    if (!display) { fprintf(stderr, "could not create virtual display\n"); return 1; }
    CGVirtualDisplaySettings *s = [CGVirtualDisplaySettings new];
    s.hiDPI = hidpi;
    s.modes = @[[[CGVirtualDisplayMode alloc] initWithWidth:w height:h refreshRate:60]];
    if (![display applySettings:s]) { fprintf(stderr, "applySettings failed\n"); return 1; }
    sleep(2);
    CGDisplayConfigRef cfg;
    CGBeginDisplayConfiguration(&cfg);
    CGConfigureDisplayOrigin(cfg, display.displayID, ox, oy);
    CGError e = CGCompleteDisplayConfiguration(cfg, kCGConfigureForSession);
    printf("display %u created, arrange error %d\n", display.displayID, e);
    fflush(stdout);
    dispatch_main();
  }
}
