import React, { useRef, useState } from 'react';
import { Animated, PanResponder, Dimensions, StyleSheet, View, Platform, Image, GestureResponderEvent, PanResponderGestureState } from 'react-native';

interface ZoomableImageProps {
  uri: string;
}

function NativeZoomableImage({ uri, width, imageHeight }: { uri: string; width: number; imageHeight: number }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const scaleVal = useRef(1);
  const translateXVal = useRef(0);
  const translateYVal = useRef(0);
  const baseScale = useRef(1);
  const baseTX = useRef(0);
  const baseTY = useRef(0);
  const initialPinchDistance = useRef(0);
  const isPinching = useRef(false);
  const lastTapTime = useRef(0);
  const pinchCenterX = useRef(0);
  const pinchCenterY = useRef(0);
  const touchCount = useRef(0);

  const getDistance = (touches: any[]) => {
    const dx = touches[1].pageX - touches[0].pageX;
    const dy = touches[1].pageY - touches[0].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampTranslation = (tx: number, ty: number, s: number) => {
    const maxTX = Math.max(0, (width * s - width) / (2 * s));
    const maxTY = Math.max(0, (imageHeight * s - imageHeight) / (2 * s));
    return {
      x: Math.max(-maxTX, Math.min(maxTX, tx)),
      y: Math.max(-maxTY, Math.min(maxTY, ty)),
    };
  };

  const resetToDefault = () => {
    scaleVal.current = 1;
    translateXVal.current = 0;
    translateYVal.current = 0;
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 7 }),
      Animated.spring(translateXAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
      Animated.spring(translateYAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) return true;
        if (isPinching.current) return true;
        return scaleVal.current > 1 && (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2);
      },
      onShouldBlockNativeResponder: () => true,
      onPanResponderTerminationRequest: () => !isPinching.current && scaleVal.current <= 1,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        touchCount.current = evt.nativeEvent.touches ? evt.nativeEvent.touches.length : 1;
        baseScale.current = scaleVal.current;
        baseTX.current = translateXVal.current;
        baseTY.current = translateYVal.current;
        initialPinchDistance.current = 0;
        isPinching.current = false;

        if (touchCount.current === 1) {
          const now = Date.now();
          if (now - lastTapTime.current < 300) {
            if (scaleVal.current > 1.1) {
              resetToDefault();
            } else {
              const newScale = 3;
              scaleVal.current = newScale;
              Animated.spring(scaleAnim, { toValue: newScale, useNativeDriver: true, friction: 7 }).start();
            }
            lastTapTime.current = 0;
          } else {
            lastTapTime.current = now;
          }
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          isPinching.current = true;
          lastTapTime.current = 0;
          const dist = getDistance(touches as any);

          if (initialPinchDistance.current === 0) {
            initialPinchDistance.current = dist;
            baseScale.current = scaleVal.current;
            baseTX.current = translateXVal.current;
            baseTY.current = translateYVal.current;
            pinchCenterX.current = (touches[0].pageX + touches[1].pageX) / 2;
            pinchCenterY.current = (touches[0].pageY + touches[1].pageY) / 2;
            return;
          }

          const ratio = dist / initialPinchDistance.current;
          const newScale = Math.max(1, Math.min(6, baseScale.current * ratio));
          scaleVal.current = newScale;
          scaleAnim.setValue(newScale);

          const currentCenterX = (touches[0].pageX + touches[1].pageX) / 2;
          const currentCenterY = (touches[0].pageY + touches[1].pageY) / 2;
          const panX = (currentCenterX - pinchCenterX.current) / newScale;
          const panY = (currentCenterY - pinchCenterY.current) / newScale;

          const clamped = clampTranslation(baseTX.current + panX, baseTY.current + panY, newScale);
          translateXVal.current = clamped.x;
          translateYVal.current = clamped.y;
          translateXAnim.setValue(clamped.x);
          translateYAnim.setValue(clamped.y);
        } else if (!isPinching.current && scaleVal.current > 1) {
          const newX = baseTX.current + gestureState.dx / scaleVal.current;
          const newY = baseTY.current + gestureState.dy / scaleVal.current;
          const clamped = clampTranslation(newX, newY, scaleVal.current);
          translateXVal.current = clamped.x;
          translateYVal.current = clamped.y;
          translateXAnim.setValue(clamped.x);
          translateYAnim.setValue(clamped.y);
        }
      },
      onPanResponderRelease: () => {
        initialPinchDistance.current = 0;
        isPinching.current = false;
        touchCount.current = 0;

        if (scaleVal.current <= 1.05) {
          resetToDefault();
        } else {
          const clamped = clampTranslation(translateXVal.current, translateYVal.current, scaleVal.current);
          if (clamped.x !== translateXVal.current || clamped.y !== translateYVal.current) {
            translateXVal.current = clamped.x;
            translateYVal.current = clamped.y;
            Animated.parallel([
              Animated.spring(translateXAnim, { toValue: clamped.x, useNativeDriver: true, friction: 7 }),
              Animated.spring(translateYAnim, { toValue: clamped.y, useNativeDriver: true, friction: 7 }),
            ]).start();
          }
        }
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={{
          width,
          height: imageHeight,
          transform: [
            { scale: scaleAnim },
            { translateX: translateXAnim },
            { translateY: translateYAnim },
          ],
        }}
        resizeMode="contain"
      />
    </View>
  );
}

function WebZoomableImage({ uri, width, imageHeight }: { uri: string; width: number; imageHeight: number }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);
  const baseTranslateXRef = useRef(0);
  const baseTranslateYRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => zoomLevel > 1,
      onMoveShouldSetPanResponder: (_, gs) => zoomLevel > 1 && (Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2),
      onPanResponderGrant: () => {
        baseTranslateXRef.current = translateXRef.current;
        baseTranslateYRef.current = translateYRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = baseTranslateXRef.current + gestureState.dx;
        const newY = baseTranslateYRef.current + gestureState.dy;
        translateXRef.current = newX;
        translateYRef.current = newY;
        translateX.setValue(newX);
        translateY.setValue(newY);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const handleDoubleTap = (() => {
    let lastTap = 0;
    return () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        if (zoomLevel > 1) {
          setZoomLevel(1);
          translateXRef.current = 0;
          translateYRef.current = 0;
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        } else {
          setZoomLevel(2.5);
        }
      }
      lastTap = now;
    };
  })();

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Animated.View
        style={{
          transform: [
            { scale: zoomLevel },
            { translateX },
            { translateY },
          ],
        }}
      >
        <Image
          source={{ uri }}
          style={{ width, height: imageHeight }}
          resizeMode="contain"
          // @ts-ignore - web onClick
          onStartShouldSetResponder={() => true}
          onResponderRelease={handleDoubleTap}
        />
      </Animated.View>
    </View>
  );
}

export function ZoomableImage({ uri }: ZoomableImageProps) {
  const { width, height } = Dimensions.get('window');
  const imageHeight = height - 120;

  if (Platform.OS === 'web') {
    return <WebZoomableImage uri={uri} width={width} imageHeight={imageHeight} />;
  }
  return <NativeZoomableImage uri={uri} width={width} imageHeight={imageHeight} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
});
