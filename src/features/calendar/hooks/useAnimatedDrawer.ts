// src/screens/calendar/hooks/useAnimatedDrawer.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

type DrawerSide = 'left' | 'right';

export function useAnimatedDrawer(width: number, side: DrawerSide) {
  const closedX = side === 'left' ? -width : width;
  const [open, setOpen] = useState(false);
  const x = useRef(new Animated.Value(closedX)).current;
  const [xVal, setXVal] = useState<number>(closedX);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) {
      x.stopAnimation();
      x.setValue(closedX);
      requestAnimationFrame(() => {
        Animated.timing(x, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    } else {
      x.stopAnimation();
      Animated.timing(x, {
        toValue: closedX,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [open, x, closedX]);

  useEffect(() => {
    const id = x.addListener(({ value }) => setXVal(value));
    return () => x.removeListener(id);
  }, [x]);

  return useMemo(
    () => ({ open, openDrawer, closeDrawer, x, xVal }),
    [open, openDrawer, closeDrawer, x, xVal]
  );
}
